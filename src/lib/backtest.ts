// ============================================================
// QUANT EDGE — Backtesting Engine (Phase 4)
// Runs signal engine on historical data, simulates trades,
// calculates performance metrics, and optimizes parameters
// ============================================================

import { Bar, CompositeSignal } from "./types";
import { analyzeSymbol } from "./signals";
import { simulateOptionPrice, getSimulatedEntry } from "./options-sim";

// ── Types ───────────────────────────────────────────────────

export interface BacktestConfig {
  symbols: string[];
  startDate: string;          // ISO date
  endDate: string;            // ISO date
  signalThreshold: number;
  entryMinActiveSignals: number;
  // Position management
  hardStopPercent: number;
  trailingStopPercent: number;
  takeProfitPercent: number;
  // Exit tuning
  signalCollapseThreshold: number;  // exit if signal drops below this (0 = disabled)
  minHoldBars: number;              // minimum bars to hold before any exit except hard stop
  maxHoldBars: number;              // force exit after this many bars (0 = no limit, 78 = ~1 day)
  // Simulation
  optionDeltaMultiplier: number;
  spreadCostPercent: number;
  contractCost: number;
  maxConcurrentPositions: number;
  cooldownBars: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  symbols: [],
  startDate: "",
  endDate: "",
  signalThreshold: 70,
  entryMinActiveSignals: 2,
  hardStopPercent: 50,
  trailingStopPercent: 35,
  takeProfitPercent: 100,
  signalCollapseThreshold: 0,   // DISABLED by default — this was killing trades
  minHoldBars: 4,               // hold at least 4 bars (20 min) before trailing/signal exits
  maxHoldBars: 78,              // 78 bars × 5min = 6.5 hours = 1 trading day (0 = no limit)
  optionDeltaMultiplier: 3.0,
  spreadCostPercent: 5,
  contractCost: 30,
  maxConcurrentPositions: 3,
  cooldownBars: 6,
};

export interface BacktestTrade {
  symbol: string;
  entryBar: number;
  exitBar: number;
  entryPrice: number;
  exitPrice: number;
  entrySignalScore: number;
  exitReason: string;
  pnlPercent: number;
  pnlDollar: number;
  barsHeld: number;
  highWaterMark: number;
  maxDrawdownPercent: number;
  activeSignals: string[];
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  equityCurve: number[];
  signalDistribution: { score: number; count: number }[];
  dailyReturns: { date: string; pnl: number }[];
  bySymbol: Record<string, SymbolMetrics>;
  ranAt: string;
}

export interface BacktestMetrics {
  totalTrades: number;
  winRate: number;
  totalPnlPercent: number;
  totalPnlDollar: number;
  avgWinPercent: number;
  avgLossPercent: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdownPercent: number;
  profitFactor: number;       // gross wins / gross losses
  sharpeRatio: number;
  avgBarsHeld: number;
  avgTradesPerDay: number;
  expectancy: number;         // avg $ per trade
  winLossRatio: number;       // avg win / avg loss (absolute)
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

export interface SymbolMetrics {
  symbol: string;
  trades: number;
  winRate: number;
  totalPnl: number;
  avgScore: number;
}

export interface OptimizationResult {
  paramName: string;
  paramValues: number[];
  results: {
    value: number;
    winRate: number;
    totalPnl: number;
    sharpe: number;
    trades: number;
  }[];
  bestValue: number;
  bestSharpe: number;
}

// ── Backtest Engine ─────────────────────────────────────────

/**
 * Run a full backtest on historical bar data
 */
export function runBacktest(
  allBars: Record<string, Bar[]>,  // symbol -> bars
  config: BacktestConfig
): BacktestResult {
  const trades: BacktestTrade[] = [];
  const openPositions: Map<string, {
    symbol: string;
    entryBar: number;
    entryPrice: number;
    signalScore: number;
    highWaterMark: number;
    activeSignals: string[];
  }> = new Map();

  // Track cooldowns per symbol
  const cooldowns: Map<string, number> = new Map();

  // Find the longest bar array to iterate
  const maxBars = Math.max(...Object.values(allBars).map((b) => b.length));
  const startingBalance = 500;
  let balance = startingBalance;
  const equityCurve: number[] = [balance];
  const dailyPnl: Map<string, number> = new Map();

  // Signal score distribution tracking
  const scoreHist: Map<number, number> = new Map();

  // Minimum bars needed for indicators
  const WARMUP = 30;

  // ── Main simulation loop ──
  for (let i = WARMUP; i < maxBars; i++) {
    // Check exits first
    for (const [sym, pos] of Array.from(openPositions.entries())) {
      const bars = allBars[sym];
      if (!bars || i >= bars.length) continue;

      const currentPrice = bars[i].close;
      const stockPriceAtEntry = bars[pos.entryBar].close;
      const barsHeldSoFar = i - pos.entryBar;

      // Black-Scholes simulation instead of flat delta multiplier
      // Convert optionDeltaMultiplier to approximate delta: 3x→0.30, 5x→0.15, 8x→0.10
      const approxDelta = Math.max(0.05, 0.50 / config.optionDeltaMultiplier);
      const approxOTM = Math.max(0.01, (1 - approxDelta) * 0.10);
      const sim = simulateOptionPrice(
        { deltaAtEntry: approxDelta, strikeOTMPercent: approxOTM, iv: 0.40, dteAtEntry: 1 },
        stockPriceAtEntry, currentPrice, barsHeldSoFar, config.contractCost
      );

      const simOptionPrice = pos.entryPrice * (1 + sim.pnlPercent / 100);
      const pnlPercent = sim.pnlPercent;
      const newHigh = Math.max(pos.highWaterMark, simOptionPrice);
      pos.highWaterMark = newHigh;

      const barsHeld = i - pos.entryBar;
      const pastMinHold = barsHeld >= config.minHoldBars;
      let exitReason = "";

      // Hard stop — ALWAYS active, even during min hold period (protect capital)
      if (pnlPercent <= -config.hardStopPercent) {
        exitReason = `Hard stop: ${pnlPercent.toFixed(1)}%`;
      }
      // Max hold time — force exit (simulates end of trading day)
      else if (config.maxHoldBars > 0 && barsHeld >= config.maxHoldBars) {
        exitReason = `Max hold reached: ${barsHeld} bars (${(barsHeld * 5 / 60).toFixed(1)}hrs) — P&L: ${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%`;
      }
      // Everything below only triggers AFTER min hold period
      else if (pastMinHold) {
        // Take profit
        if (config.takeProfitPercent > 0 && pnlPercent >= config.takeProfitPercent) {
          exitReason = `Take profit: +${pnlPercent.toFixed(1)}%`;
        }
        // Trailing stop
        else if (newHigh > pos.entryPrice) {
          const dropFromHigh = ((newHigh - simOptionPrice) / newHigh) * 100;
          if (dropFromHigh >= config.trailingStopPercent) {
            exitReason = `Trailing stop: -${dropFromHigh.toFixed(1)}% from high`;
          }
        }

        // Signal collapse exit — only if enabled (threshold > 0) AND past min hold
        if (!exitReason && config.signalCollapseThreshold > 0) {
          const window = bars.slice(Math.max(0, i - 79), i + 1);
          const signal = analyzeSymbol(sym, window);
          if (signal.score < config.signalCollapseThreshold) {
            exitReason = `Signal collapsed to ${signal.score} (threshold: ${config.signalCollapseThreshold})`;
          }
        }
      }

      if (exitReason) {
        const finalPnl = pnlPercent - config.spreadCostPercent;
        const pnlDollar = (finalPnl / 100) * config.contractCost;
        const maxDD = ((pos.highWaterMark - simOptionPrice) / pos.highWaterMark) * 100;

        trades.push({
          symbol: sym,
          entryBar: pos.entryBar,
          exitBar: i,
          entryPrice: pos.entryPrice,
          exitPrice: simOptionPrice,
          entrySignalScore: pos.signalScore,
          exitReason,
          pnlPercent: finalPnl,
          pnlDollar,
          barsHeld: i - pos.entryBar,
          highWaterMark: pos.highWaterMark,
          maxDrawdownPercent: maxDD,
          activeSignals: pos.activeSignals,
        });

        balance += pnlDollar;
        openPositions.delete(sym);
        cooldowns.set(sym, i);

        // Track daily P&L
        const date = bars[i].timestamp.slice(0, 10);
        dailyPnl.set(date, (dailyPnl.get(date) || 0) + pnlDollar);
      }
    }

    // Check entries
    if (openPositions.size < config.maxConcurrentPositions) {
      for (const sym of config.symbols) {
        if (openPositions.has(sym)) continue;

        // Cooldown check
        const lastExit = cooldowns.get(sym) || 0;
        if (i - lastExit < config.cooldownBars) continue;

        const bars = allBars[sym];
        if (!bars || i >= bars.length || bars.length < WARMUP) continue;

        // Run signal engine on window
        const window = bars.slice(Math.max(0, i - 79), i + 1);
        const signal = analyzeSymbol(sym, window);

        // Track score distribution
        const bucket = Math.floor(signal.score / 10) * 10;
        scoreHist.set(bucket, (scoreHist.get(bucket) || 0) + 1);

        if (signal.score >= config.signalThreshold) {
          const activeCount = signal.signals.filter((s) => s.active).length;
          if (activeCount >= config.entryMinActiveSignals) {
            // Simulate entry
            const entryPrice = bars[i].close;
            const simContractPrice = config.contractCost / 100; // per-share

            openPositions.set(sym, {
              symbol: sym,
              entryBar: i,
              entryPrice: simContractPrice,
              signalScore: signal.score,
              highWaterMark: simContractPrice,
              activeSignals: signal.signals.filter((s) => s.active).map((s) => s.name),
            });
          }
        }
      }
    }

    equityCurve.push(balance);
  }

  // Close any remaining positions at last price
  for (const [sym, pos] of Array.from(openPositions.entries())) {
    const bars = allBars[sym];
    if (!bars || bars.length === 0) continue;
    const lastBar = bars[bars.length - 1];
    const endBarsHeld = bars.length - 1 - pos.entryBar;
    const endApproxDelta = Math.max(0.05, 0.50 / config.optionDeltaMultiplier);
    const endApproxOTM = Math.max(0.01, (1 - endApproxDelta) * 0.10);
    const endSim = simulateOptionPrice(
      { deltaAtEntry: endApproxDelta, strikeOTMPercent: endApproxOTM, iv: 0.40, dteAtEntry: 1 },
      bars[pos.entryBar].close, lastBar.close, endBarsHeld, config.contractCost
    );
    const simOptionPrice = pos.entryPrice * (1 + endSim.pnlPercent / 100);
    const pnlPercent = endSim.pnlPercent - config.spreadCostPercent;
    const pnlDollar = (pnlPercent / 100) * config.contractCost;

    trades.push({
      symbol: sym,
      entryBar: pos.entryBar,
      exitBar: bars.length - 1,
      entryPrice: pos.entryPrice,
      exitPrice: simOptionPrice,
      entrySignalScore: pos.signalScore,
      exitReason: "End of data",
      pnlPercent,
      pnlDollar,
      barsHeld: bars.length - 1 - pos.entryBar,
      highWaterMark: pos.highWaterMark,
      maxDrawdownPercent: 0,
      activeSignals: pos.activeSignals,
    });

    balance += pnlDollar;
  }

  // ── Calculate Metrics ──
  const metrics = calculateMetrics(trades, equityCurve, startingBalance);

  // Score distribution
  const signalDistribution = Array.from(scoreHist.entries())
    .map(([score, count]) => ({ score, count }))
    .sort((a, b) => a.score - b.score);

  // Daily returns
  const dailyReturns = Array.from(dailyPnl.entries())
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // By-symbol breakdown
  const bySymbol: Record<string, SymbolMetrics> = {};
  for (const sym of config.symbols) {
    const symTrades = trades.filter((t) => t.symbol === sym);
    const wins = symTrades.filter((t) => t.pnlDollar > 0);
    bySymbol[sym] = {
      symbol: sym,
      trades: symTrades.length,
      winRate: symTrades.length > 0 ? (wins.length / symTrades.length) * 100 : 0,
      totalPnl: symTrades.reduce((sum, t) => sum + t.pnlDollar, 0),
      avgScore: symTrades.length > 0
        ? symTrades.reduce((sum, t) => sum + t.entrySignalScore, 0) / symTrades.length
        : 0,
    };
  }

  return {
    config,
    trades,
    metrics,
    equityCurve,
    signalDistribution,
    dailyReturns,
    bySymbol,
    ranAt: new Date().toISOString(),
  };
}

// ── Metrics Calculator ──────────────────────────────────────

function calculateMetrics(
  trades: BacktestTrade[],
  equityCurve: number[],
  startingBalance: number
): BacktestMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winRate: 0, totalPnlPercent: 0, totalPnlDollar: 0,
      avgWinPercent: 0, avgLossPercent: 0, largestWin: 0, largestLoss: 0,
      maxDrawdownPercent: 0, profitFactor: 0, sharpeRatio: 0, avgBarsHeld: 0,
      avgTradesPerDay: 0, expectancy: 0, winLossRatio: 0,
      maxConsecutiveWins: 0, maxConsecutiveLosses: 0,
    };
  }

  const wins = trades.filter((t) => t.pnlDollar > 0);
  const losses = trades.filter((t) => t.pnlDollar <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnlDollar, 0);
  const grossWins = wins.reduce((s, t) => s + t.pnlDollar, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.pnlDollar, 0));

  // Max drawdown from equity curve
  let peak = equityCurve[0];
  let maxDD = 0;
  for (const val of equityCurve) {
    if (val > peak) peak = val;
    const dd = ((peak - val) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe ratio (simplified: daily returns)
  const returns = trades.map((t) => t.pnlPercent);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdDev = Math.sqrt(
    returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0;
  let consecWins = 0, consecLosses = 0;
  for (const t of trades) {
    if (t.pnlDollar > 0) {
      consecWins++;
      consecLosses = 0;
      maxConsecWins = Math.max(maxConsecWins, consecWins);
    } else {
      consecLosses++;
      consecWins = 0;
      maxConsecLosses = Math.max(maxConsecLosses, consecLosses);
    }
  }

  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0;

  return {
    totalTrades: trades.length,
    winRate: (wins.length / trades.length) * 100,
    totalPnlPercent: (totalPnl / startingBalance) * 100,
    totalPnlDollar: totalPnl,
    avgWinPercent: avgWin,
    avgLossPercent: avgLoss,
    largestWin: trades.length > 0 ? Math.max(...trades.map((t) => t.pnlDollar)) : 0,
    largestLoss: trades.length > 0 ? Math.min(...trades.map((t) => t.pnlDollar)) : 0,
    maxDrawdownPercent: maxDD,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0,
    sharpeRatio: sharpe,
    avgBarsHeld: trades.reduce((s, t) => s + t.barsHeld, 0) / trades.length,
    avgTradesPerDay: 0, // calculated from daily data
    expectancy: totalPnl / trades.length,
    winLossRatio: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0,
    maxConsecutiveWins: maxConsecWins,
    maxConsecutiveLosses: maxConsecLosses,
  };
}

// ── Parameter Optimization ──────────────────────────────────

/**
 * Sweep a single parameter across a range and find optimal value
 */
export function optimizeParameter(
  allBars: Record<string, Bar[]>,
  baseConfig: BacktestConfig,
  paramName: keyof BacktestConfig,
  values: number[]
): OptimizationResult {
  const results = values.map((value) => {
    const config = { ...baseConfig, [paramName]: value };
    const result = runBacktest(allBars, config);
    return {
      value,
      winRate: result.metrics.winRate,
      totalPnl: result.metrics.totalPnlDollar,
      sharpe: result.metrics.sharpeRatio,
      trades: result.metrics.totalTrades,
    };
  });

  // Find best by Sharpe ratio (risk-adjusted returns)
  const best = results.reduce((a, b) => (b.sharpe > a.sharpe ? b : a), results[0]);

  return {
    paramName: paramName as string,
    paramValues: values,
    results,
    bestValue: best.value,
    bestSharpe: best.sharpe,
  };
}

// ── Multi-Parameter Grid Search ─────────────────────────────

export interface GridSearchResult {
  totalCombinations: number;
  completed: number;
  topResults: GridSearchEntry[];
  paramRanges: Record<string, number[]>;
  ranAt: string;
}

export interface GridSearchEntry {
  rank: number;
  params: Record<string, number>;
  winRate: number;
  totalPnl: number;
  sharpe: number;
  profitFactor: number;
  trades: number;
  expectancy: number;
  maxDrawdown: number;
}

/**
 * Run a grid search across multiple parameters simultaneously.
 * Tests all combinations and returns the top results sorted by Sharpe.
 */
export function gridSearch(
  allBars: Record<string, Bar[]>,
  baseConfig: BacktestConfig,
  paramGrid: Record<string, number[]>,
  maxResults: number = 20
): GridSearchResult {
  const paramNames = Object.keys(paramGrid);
  const paramValues = Object.values(paramGrid);

  // Generate all combinations
  const combinations: Record<string, number>[] = [];
  function generateCombinations(index: number, current: Record<string, number>) {
    if (index === paramNames.length) {
      combinations.push({ ...current });
      return;
    }
    for (const value of paramValues[index]) {
      current[paramNames[index]] = value;
      generateCombinations(index + 1, current);
    }
  }
  generateCombinations(0, {});

  // Run backtest for each combination
  const results: GridSearchEntry[] = [];

  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i];
    const config = { ...baseConfig, ...combo };

    try {
      const result = runBacktest(allBars, config);
      const m = result.metrics;

      // Only include if there were trades
      if (m.totalTrades > 0) {
        results.push({
          rank: 0,
          params: combo,
          winRate: m.winRate || 0,
          totalPnl: m.totalPnlDollar || 0,
          sharpe: m.sharpeRatio || 0,
          profitFactor: m.profitFactor === Infinity ? 999 : (m.profitFactor || 0),
          trades: m.totalTrades,
          expectancy: m.expectancy || 0,
          maxDrawdown: m.maxDrawdownPercent || 0,
        });
      }
    } catch (err) {
      // Skip failed combinations
    }
  }

  // Sort by Sharpe ratio descending
  results.sort((a, b) => b.sharpe - a.sharpe);

  // Assign ranks and take top N
  const topResults = results.slice(0, maxResults).map((r, i) => ({
    ...r,
    rank: i + 1,
  }));

  return {
    totalCombinations: combinations.length,
    completed: results.length,
    topResults,
    paramRanges: paramGrid,
    ranAt: new Date().toISOString(),
  };
}
