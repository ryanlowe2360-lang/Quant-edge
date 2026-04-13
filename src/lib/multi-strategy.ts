// ============================================================
// QUANT EDGE — Multi-Strategy Engine
// Runs top 10 grid search strategies independently
// Each gets $10k allocation, tracks its own P&L
// ============================================================

import { CompositeSignal, Quote, Alert } from "./types";

// ── Types ───────────────────────────────────────────────────

export interface StrategyParams {
  signalThreshold: number;
  trailingStopPercent: number;
  hardStopPercent: number;
  takeProfitPercent: number;
  maxHoldBars: number;
  minHoldBars: number;
  entryMinActiveSignals: number;
  optionDeltaMultiplier: number;
  signalCollapseThreshold: number;
}

export interface StrategyPosition {
  id: string;
  symbol: string;
  entryPrice: number;      // stock price at entry
  entryTime: string;
  entryScore: number;
  optionEstimatedCost: number;
  currentPrice: number;
  highWaterMark: number;
  pnlPercent: number;
  pnlDollar: number;
  barsHeld: number;
  status: "OPEN" | "CLOSED";
  exitReason?: string;
  exitTime?: string;
  exitPrice?: number;
}

export interface StrategySlot {
  id: number;               // 1-10
  name: string;             // "Strategy #1"
  params: StrategyParams;
  allocation: number;       // $10,000
  balance: number;          // current balance after P&L
  positions: StrategyPosition[];
  tradeHistory: StrategyPosition[];
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  sharpe: number;           // from grid search
  isActive: boolean;
}

export interface MultiStrategyState {
  strategies: StrategySlot[];
  convergenceAlerts: ConvergenceAlert[];
}

export interface ConvergenceAlert {
  symbol: string;
  strategiesAgreeing: number[];  // strategy IDs that agree
  count: number;
  avgScore: number;
  timestamp: string;
}

// ── Strategy Management ─────────────────────────────────────

/**
 * Create strategy slots from grid search top results
 */
export function createStrategiesFromGridSearch(
  gridResults: any[],
  allocationPerStrategy: number = 10000
): StrategySlot[] {
  return gridResults.slice(0, 10).map((result, index) => ({
    id: index + 1,
    name: `Strategy #${index + 1}`,
    params: {
      signalThreshold: result.params.signalThreshold || 65,
      trailingStopPercent: result.params.trailingStopPercent || 25,
      hardStopPercent: result.params.hardStopPercent || 35,
      takeProfitPercent: result.params.takeProfitPercent || 0,
      maxHoldBars: result.params.maxHoldBars || 78,
      minHoldBars: result.params.minHoldBars || 4,
      entryMinActiveSignals: result.params.entryMinActiveSignals || 2,
      optionDeltaMultiplier: result.params.optionDeltaMultiplier || 3,
      signalCollapseThreshold: result.params.signalCollapseThreshold || 0,
    },
    allocation: allocationPerStrategy,
    balance: allocationPerStrategy,
    positions: [],
    tradeHistory: [],
    totalTrades: 0,
    wins: 0,
    losses: 0,
    totalPnl: 0,
    sharpe: result.sharpe || 0,
    isActive: true,
  }));
}

// ── Signal Evaluation ───────────────────────────────────────

/**
 * Evaluate a signal against a specific strategy's parameters
 */
export function evaluateSignalForStrategy(
  signal: CompositeSignal,
  params: StrategyParams
): { shouldEnter: boolean; reason: string } {
  // Check threshold
  if (signal.score < params.signalThreshold) {
    return { shouldEnter: false, reason: `Score ${signal.score} < threshold ${params.signalThreshold}` };
  }

  // Check direction
  if (signal.direction !== "LONG") {
    return { shouldEnter: false, reason: "Not LONG direction" };
  }

  // Check active signal count
  const activeCount = signal.signals.filter((s) => s.active).length;
  if (activeCount < params.entryMinActiveSignals) {
    return { shouldEnter: false, reason: `${activeCount} active signals < min ${params.entryMinActiveSignals}` };
  }

  return {
    shouldEnter: true,
    reason: `Score ${signal.score}, ${activeCount} active signals`,
  };
}

/**
 * Evaluate all strategies against current signals
 * Returns which strategies want to enter on which symbols
 */
export function evaluateAllStrategies(
  strategies: StrategySlot[],
  signals: Record<string, CompositeSignal>,
  quotes: Record<string, any>
): {
  entries: { strategyId: number; symbol: string; score: number; reason: string }[];
  convergence: ConvergenceAlert[];
} {
  const entries: { strategyId: number; symbol: string; score: number; reason: string }[] = [];
  const symbolCounts: Record<string, { strategies: number[]; scores: number[] }> = {};

  for (const strategy of strategies) {
    if (!strategy.isActive) continue;

    // Skip if strategy has max positions
    const openCount = strategy.positions.filter((p) => p.status === "OPEN").length;
    if (openCount >= 3) continue; // Max 3 per strategy

    for (const [sym, signal] of Object.entries(signals)) {
      // Skip if already in this position for this strategy
      if (strategy.positions.some((p) => p.status === "OPEN" && p.symbol === sym)) continue;

      const eval_ = evaluateSignalForStrategy(signal, strategy.params);
      if (eval_.shouldEnter) {
        entries.push({
          strategyId: strategy.id,
          symbol: sym,
          score: signal.score,
          reason: eval_.reason,
        });

        // Track convergence
        if (!symbolCounts[sym]) {
          symbolCounts[sym] = { strategies: [], scores: [] };
        }
        symbolCounts[sym].strategies.push(strategy.id);
        symbolCounts[sym].scores.push(signal.score);
      }
    }
  }

  // Generate convergence alerts (2+ strategies agree)
  const convergence: ConvergenceAlert[] = [];
  for (const [sym, data] of Object.entries(symbolCounts)) {
    if (data.strategies.length >= 2) {
      convergence.push({
        symbol: sym,
        strategiesAgreeing: data.strategies,
        count: data.strategies.length,
        avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return { entries, convergence };
}

// ── Position Management ─────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Open a position for a strategy
 */
export function openStrategyPosition(
  strategy: StrategySlot,
  symbol: string,
  stockPrice: number,
  signalScore: number,
  contractCost: number
): StrategySlot {
  const position: StrategyPosition = {
    id: generateId(),
    symbol,
    entryPrice: stockPrice,
    entryTime: new Date().toISOString(),
    entryScore: signalScore,
    optionEstimatedCost: contractCost,
    currentPrice: stockPrice,
    highWaterMark: stockPrice,
    pnlPercent: 0,
    pnlDollar: 0,
    barsHeld: 0,
    status: "OPEN",
  };

  return {
    ...strategy,
    positions: [...strategy.positions, position],
    balance: strategy.balance - contractCost,
    totalTrades: strategy.totalTrades + 1,
  };
}

/**
 * Update and check exits for all open positions in a strategy
 */
export function updateStrategyPositions(
  strategy: StrategySlot,
  quotes: Record<string, any>,
  signals: Record<string, CompositeSignal>
): { updatedStrategy: StrategySlot; closedPositions: StrategyPosition[] } {
  const closedPositions: StrategyPosition[] = [];
  const updatedPositions = strategy.positions.map((pos) => {
    if (pos.status !== "OPEN") return pos;

    const quote = quotes[pos.symbol];
    if (!quote?.price) return pos;

    const currentPrice = quote.price;
    const stockReturn = (currentPrice - pos.entryPrice) / pos.entryPrice;
    const optionReturn = stockReturn * strategy.params.optionDeltaMultiplier;
    const pnlPercent = optionReturn * 100;
    const pnlDollar = pnlPercent / 100 * pos.optionEstimatedCost;
    const highWaterMark = Math.max(pos.highWaterMark, currentPrice);
    const barsHeld = pos.barsHeld + 1;

    let exitReason: string | undefined;

    // Hard stop
    if (pnlPercent <= -strategy.params.hardStopPercent) {
      exitReason = `Hard stop: ${pnlPercent.toFixed(1)}%`;
    }
    // Max hold
    else if (strategy.params.maxHoldBars > 0 && barsHeld >= strategy.params.maxHoldBars) {
      exitReason = `Max hold: ${barsHeld} bars`;
    }
    // Min hold check
    else if (barsHeld >= strategy.params.minHoldBars) {
      // Take profit
      if (strategy.params.takeProfitPercent > 0 && pnlPercent >= strategy.params.takeProfitPercent) {
        exitReason = `Take profit: +${pnlPercent.toFixed(1)}%`;
      }
      // Trailing stop
      else if (highWaterMark > pos.entryPrice) {
        const hwReturn = (highWaterMark - pos.entryPrice) / pos.entryPrice;
        const hwOptionPeak = hwReturn * strategy.params.optionDeltaMultiplier * 100;
        const dropFromPeak = hwOptionPeak - pnlPercent;
        if (dropFromPeak >= strategy.params.trailingStopPercent && hwOptionPeak > 0) {
          exitReason = `Trailing stop: -${dropFromPeak.toFixed(1)}% from peak`;
        }
      }
      // Signal collapse
      if (!exitReason && strategy.params.signalCollapseThreshold > 0) {
        const signal = signals[pos.symbol];
        if (signal && signal.score < strategy.params.signalCollapseThreshold) {
          exitReason = `Signal collapsed to ${signal.score}`;
        }
      }
    }

    // EOD exit (3:55 PM ET)
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    if (et.getHours() === 15 && et.getMinutes() >= 55) {
      exitReason = `EOD exit: P&L ${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%`;
    }

    const updated: StrategyPosition = {
      ...pos,
      currentPrice,
      highWaterMark,
      pnlPercent,
      pnlDollar,
      barsHeld,
    };

    if (exitReason) {
      updated.status = "CLOSED";
      updated.exitReason = exitReason;
      updated.exitTime = new Date().toISOString();
      updated.exitPrice = currentPrice;
      closedPositions.push(updated);
    }

    return updated;
  });

  // Update strategy stats
  let wins = strategy.wins;
  let losses = strategy.losses;
  let totalPnl = strategy.totalPnl;
  let balance = strategy.balance;

  for (const closed of closedPositions) {
    totalPnl += closed.pnlDollar;
    balance += closed.optionEstimatedCost + closed.pnlDollar;
    if (closed.pnlDollar >= 0) wins++;
    else losses++;
  }

  return {
    updatedStrategy: {
      ...strategy,
      positions: updatedPositions,
      tradeHistory: [...strategy.tradeHistory, ...closedPositions],
      wins,
      losses,
      totalPnl,
      balance,
    },
    closedPositions,
  };
}

// ── Formatting ──────────────────────────────────────────────

/**
 * Format convergence alert for Telegram
 */
export function formatConvergenceMessage(alert: ConvergenceAlert): string {
  const emoji = alert.count >= 5 ? "🔥🔥🔥" : alert.count >= 3 ? "🔥🔥" : "🔥";
  let msg = `${emoji} *CONVERGENCE: ${alert.symbol}*\n`;
  msg += `${alert.count} of 10 strategies agree!\n`;
  msg += `Strategies: ${alert.strategiesAgreeing.map((id) => `#${id}`).join(", ")}\n`;
  msg += `Avg Score: ${alert.avgScore.toFixed(0)}\n`;
  msg += `⏰ ${new Date(alert.timestamp).toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`;
  return msg;
}

/**
 * Format strategy trade for Telegram
 */
export function formatStrategyTrade(
  strategyId: number,
  symbol: string,
  action: "ENTRY" | "EXIT",
  details: string
): string {
  const emoji = action === "ENTRY" ? "🟢" : "🔴";
  return `${emoji} *Strategy #${strategyId}* — ${symbol}\n${details}`;
}

/**
 * Get leaderboard sorted by total P&L
 */
export function getLeaderboard(strategies: StrategySlot[]): StrategySlot[] {
  return [...strategies].sort((a, b) => b.totalPnl - a.totalPnl);
}

/**
 * Auto-prune losing strategies and reallocate to winners
 * Call after 2 weeks of live trading
 * Deactivates strategies that are losing and redistributes their balance
 */
export function autoPruneStrategies(
  strategies: StrategySlot[],
  minTrades: number = 10,      // need at least this many trades to evaluate
  maxLosers: number = 3         // deactivate up to this many losers
): { prunedStrategies: StrategySlot[]; pruneLog: string[] } {
  const log: string[] = [];
  const sorted = [...strategies].sort((a, b) => b.totalPnl - a.totalPnl);

  // Find losers with enough trades to evaluate
  const losers = sorted
    .filter((s) => s.isActive && s.totalTrades >= minTrades && s.totalPnl < 0)
    .slice(-maxLosers);

  if (losers.length === 0) {
    return { prunedStrategies: strategies, pruneLog: ["No strategies to prune — all profitable or not enough trades yet."] };
  }

  // Find winners to receive reallocated funds
  const winners = sorted.filter(
    (s) => s.isActive && s.totalPnl > 0 && !losers.includes(s)
  );

  // Calculate total balance to redistribute
  let redistributeTotal = 0;
  const loserIds = new Set(losers.map((l) => l.id));

  for (const loser of losers) {
    redistributeTotal += loser.balance;
    log.push(`❌ Deactivated ${loser.name}: P&L $${loser.totalPnl.toFixed(0)}, ${loser.wins}W/${loser.losses}L`);
  }

  // Redistribute evenly to winners
  const bonusPerWinner = winners.length > 0 ? redistributeTotal / winners.length : 0;
  const winnerIds = new Set(winners.map((w) => w.id));

  if (winners.length > 0) {
    log.push(`💰 Redistributed $${redistributeTotal.toFixed(0)} to ${winners.length} winning strategies (+$${bonusPerWinner.toFixed(0)} each)`);
  }

  const prunedStrategies = strategies.map((s) => {
    if (loserIds.has(s.id)) {
      return { ...s, isActive: false, balance: 0 };
    }
    if (winnerIds.has(s.id)) {
      return { ...s, balance: s.balance + bonusPerWinner };
    }
    return s;
  });

  return { prunedStrategies, pruneLog: log };
}
