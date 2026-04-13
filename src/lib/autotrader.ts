// ============================================================
// QUANT EDGE — Auto-Trader Engine (Phase 3)
// Handles position sizing, entry/exit decisions, risk management
// ============================================================

import {
  AutoTradeSettings,
  AutoTradeExecution,
  LivePosition,
  DailyStats,
  CompositeSignal,
  Quote,
  OptionsRecommendation,
  LiquidityGrade,
  PaperTrade,
} from "./types";

export const DEFAULT_AUTOTRADE_SETTINGS: AutoTradeSettings = {
  mode: "OFF",
  maxOpenPositions: 5,
  maxRiskPerTrade: 10,         // 10% of balance per trade
  maxDailyLoss: 50,            // $50 max daily loss (10% of $500)
  maxDailyTrades: 10,
  trailingStopType: "PERCENT",
  trailingStopPercent: 25,     // give runners room
  hardStopPercent: 35,         // cut losers faster
  takeProfitPercent: 0,        // DISABLED — let runners run, trailing stop handles exit
  cooldownMinutes: 10,
  requireOptionsLiquidity: false,  // Trade on signal alone, adjust duration by liquidity
  signalCollapseThreshold: 0,
  minHoldMinutes: 15,
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Risk Checks ─────────────────────────────────────────────

/**
 * Check if we're allowed to open a new trade given current risk parameters
 */
export function canOpenTrade(params: {
  settings: AutoTradeSettings;
  openPositions: LivePosition[];
  dailyStats: DailyStats;
  currentBalance: number;
  symbol: string;
  recentExecutions: AutoTradeExecution[];
}): { allowed: boolean; reason: string } {
  const { settings, openPositions, dailyStats, currentBalance, symbol, recentExecutions } = params;

  // Mode check
  if (settings.mode === "OFF") {
    return { allowed: false, reason: "Auto-trading is OFF" };
  }

  // Daily loss limit
  if (dailyStats.isLocked) {
    return { allowed: false, reason: `Daily loss limit hit ($${settings.maxDailyLoss})` };
  }

  if (dailyStats.realizedPnl <= -settings.maxDailyLoss) {
    return { allowed: false, reason: `Daily loss limit reached: $${dailyStats.realizedPnl.toFixed(0)}` };
  }

  // Max open positions
  if (openPositions.length >= settings.maxOpenPositions) {
    return { allowed: false, reason: `Max ${settings.maxOpenPositions} open positions reached` };
  }

  // Already have position in this symbol
  if (openPositions.some((p) => p.symbol === symbol)) {
    return { allowed: false, reason: `Already holding a position in ${symbol}` };
  }

  // Daily trade count
  if (dailyStats.tradesOpened >= settings.maxDailyTrades) {
    return { allowed: false, reason: `Max ${settings.maxDailyTrades} trades per day reached` };
  }

  // Cooldown check
  const lastTradeOnSymbol = recentExecutions
    .filter((e) => e.symbol === symbol && e.action === "OPEN")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  if (lastTradeOnSymbol) {
    const elapsed = (Date.now() - new Date(lastTradeOnSymbol.timestamp).getTime()) / 60000;
    if (elapsed < settings.cooldownMinutes) {
      const remaining = Math.ceil(settings.cooldownMinutes - elapsed);
      return { allowed: false, reason: `${symbol} cooldown: ${remaining} min remaining` };
    }
  }

  // Balance check - need enough for at least 1 contract
  const maxBudget = (currentBalance * settings.maxRiskPerTrade) / 100;
  if (maxBudget < 5) {
    return { allowed: false, reason: `Insufficient balance for risk params ($${maxBudget.toFixed(0)} available)` };
  }

  return { allowed: true, reason: "All checks passed" };
}

// ── Position Sizing ─────────────────────────────────────────

/**
 * Calculate how many contracts to buy based on risk parameters
 */
export function calculatePositionSize(params: {
  balance: number;
  maxRiskPercent: number;
  contractAsk: number;
}): { quantity: number; totalCost: number; riskPercent: number } {
  const { balance, maxRiskPercent, contractAsk } = params;

  const maxRiskDollars = (balance * maxRiskPercent) / 100;
  const costPerContract = contractAsk * 100;

  if (costPerContract <= 0 || costPerContract > maxRiskDollars) {
    return { quantity: 0, totalCost: 0, riskPercent: 0 };
  }

  // Start with 1 contract (conservative with small accounts)
  const maxContracts = Math.floor(maxRiskDollars / costPerContract);
  const quantity = Math.max(1, Math.min(maxContracts, 5)); // cap at 5

  const totalCost = quantity * costPerContract;
  const riskPercent = (totalCost / balance) * 100;

  return { quantity, totalCost, riskPercent };
}

// ── Entry Logic ─────────────────────────────────────────────

/**
 * Evaluate whether to enter a trade on a given symbol
 */
export function evaluateEntry(params: {
  symbol: string;
  signal: CompositeSignal;
  quote: Quote;
  recommendation: OptionsRecommendation | null;
  liquidity: LiquidityGrade;
  settings: AutoTradeSettings;
  signalThreshold: number;
}): {
  shouldEnter: boolean;
  reason: string;
  contract?: OptionsRecommendation["bestContract"];
  tradeMode?: "SCALP" | "DAYTRADE" | "SWING";  // determines hold duration
} {
  const { symbol, signal, quote, recommendation, liquidity, settings, signalThreshold } = params;

  // Signal must be above threshold
  if (signal.score < signalThreshold) {
    return { shouldEnter: false, reason: `Signal score ${signal.score} below threshold ${signalThreshold}` };
  }

  // Must be LONG direction
  if (signal.direction !== "LONG") {
    return { shouldEnter: false, reason: "Signal direction is not LONG" };
  }

  // Liquidity check — if required, block NONE entirely but allow LOW as swing
  if (settings.requireOptionsLiquidity && liquidity === "NONE") {
    return { shouldEnter: false, reason: `No options available for ${symbol}` };
  }

  // Need a recommended contract
  if (!recommendation?.bestContract) {
    return { shouldEnter: false, reason: "No viable options contract found" };
  }

  // Contract must be affordable
  const cost = recommendation.bestContract.ask * 100;
  if (cost <= 0) {
    return { shouldEnter: false, reason: "Contract has no ask price" };
  }

  // Minimum signal quality — at least 2 active indicators
  const activeCount = signal.signals.filter((s) => s.active).length;
  if (activeCount < 2) {
    return { shouldEnter: false, reason: `Only ${activeCount} active signal(s) — need at least 2` };
  }

  // Determine trade mode based on liquidity
  let tradeMode: "SCALP" | "DAYTRADE" | "SWING" = "DAYTRADE";
  if (liquidity === "HIGH") {
    tradeMode = "DAYTRADE"; // tight spreads, can scalp or daytrade
  } else if (liquidity === "MEDIUM") {
    tradeMode = "DAYTRADE"; // decent spreads, standard hold
  } else if (liquidity === "LOW") {
    tradeMode = "SWING"; // wide spreads, need to hold longer for spread to not eat profits
  }

  return {
    shouldEnter: true,
    reason: `Score ${signal.score}, ${activeCount} active signals, ${liquidity} liquidity → ${tradeMode} mode`,
    contract: recommendation.bestContract,
    tradeMode,
  };
}

// ── Exit Logic ──────────────────────────────────────────────

/**
 * Check if a position should be closed
 */
export function evaluateExit(params: {
  position: LivePosition;
  currentPrice: number;
  signal?: CompositeSignal;
  settings: AutoTradeSettings;
}): { shouldExit: boolean; reason: string; action: AutoTradeExecution["action"] } {
  const { position, currentPrice, signal, settings } = params;
  const isSwing = position.tradeMode === "SWING";

  // Swing trades get wider stops
  const effectiveHardStop = isSwing ? Math.max(settings.hardStopPercent, 45) : settings.hardStopPercent;
  const effectiveTrailingStop = isSwing ? Math.max(settings.trailingStopPercent, 35) : settings.trailingStopPercent;

  const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

  // Calculate how long we've held
  const holdMs = Date.now() - new Date(position.entryTime).getTime();
  const holdMinutes = holdMs / 60000;
  const pastMinHold = holdMinutes >= settings.minHoldMinutes;

  // 1. Hard stop — ALWAYS active, even during min hold (protect capital)
  if (pnlPercent <= -effectiveHardStop) {
    return {
      shouldExit: true,
      reason: `Hard stop hit: ${pnlPercent.toFixed(1)}% loss (limit: -${effectiveHardStop}%${isSwing ? " SWING" : ""})`,
      action: "FORCED_EXIT",
    };
  }

  // 2. End-of-day forced exit — SKIP for swing trades
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const etHour = et.getHours();
  const etMin = et.getMinutes();
  if (!isSwing && etHour === 15 && etMin >= 55) {
    return {
      shouldExit: true,
      reason: `End-of-day exit at ${etHour}:${etMin.toString().padStart(2, "0")} ET — P&L: ${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%`,
      action: "CLOSE",
    };
  }

  // Swing trades: force exit after 2 days (max hold ~156 bars)
  if (isSwing && holdMinutes > 2 * 6.5 * 60) {
    return {
      shouldExit: true,
      reason: `Swing max hold (2 days) — P&L: ${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%`,
      action: "CLOSE",
    };
  }

  // Everything below only triggers AFTER min hold period
  if (!pastMinHold) {
    return { shouldExit: false, reason: "", action: "CLOSE" };
  }

  // 2. Take profit
  if (settings.takeProfitPercent > 0 && pnlPercent >= settings.takeProfitPercent) {
    return {
      shouldExit: true,
      reason: `Take profit: +${pnlPercent.toFixed(1)}% gain (target: ${settings.takeProfitPercent}%)`,
      action: "TAKE_PROFIT",
    };
  }

  // 3. Trailing stop — based on high water mark (wider for swing trades)
  if (settings.trailingStopType === "PERCENT" && position.highWaterMark > 0) {
    const dropFromHigh =
      ((position.highWaterMark - currentPrice) / position.highWaterMark) * 100;

    if (dropFromHigh >= effectiveTrailingStop && currentPrice < position.highWaterMark) {
      return {
        shouldExit: true,
        reason: `Trailing stop: dropped ${dropFromHigh.toFixed(1)}% from high of $${position.highWaterMark.toFixed(2)}`,
        action: "STOP_HIT",
      };
    }
  }

  // 4. Signal collapse — only if enabled (threshold > 0)
  if (settings.signalCollapseThreshold > 0 && signal && signal.score < settings.signalCollapseThreshold && position.unrealizedPnlPercent < 10) {
    return {
      shouldExit: true,
      reason: `Signal collapsed to ${signal.score} (threshold: ${settings.signalCollapseThreshold})`,
      action: "CLOSE",
    };
  }

  return { shouldExit: false, reason: "", action: "CLOSE" };
}

// ── Position Management ─────────────────────────────────────

/**
 * Update a position with current market price
 */
export function updatePosition(
  position: LivePosition,
  currentPrice: number,
  signal?: CompositeSignal
): LivePosition {
  const unrealizedPnl = (currentPrice - position.entryPrice) * position.quantity * 100;
  const unrealizedPnlPercent =
    position.entryPrice > 0
      ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
      : 0;

  const highWaterMark = Math.max(position.highWaterMark, currentPrice);

  // Check for exit signal
  let exitSignalActive = false;
  let exitSignalReason = "";

  if (signal && signal.score < 30) {
    exitSignalActive = true;
    exitSignalReason = `Signal weakening (${signal.score})`;
  }

  if (unrealizedPnlPercent <= -30) {
    exitSignalActive = true;
    exitSignalReason = `Down ${unrealizedPnlPercent.toFixed(0)}% — approaching stop`;
  }

  return {
    ...position,
    currentPrice,
    unrealizedPnl,
    unrealizedPnlPercent,
    highWaterMark,
    exitSignalActive,
    exitSignalReason,
  };
}

/**
 * Create a new LivePosition from a trade entry
 */
export function createPosition(params: {
  symbol: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  entryPrice: number;
  quantity: number;
  signalScore: number;
  contractSymbol?: string;
  stopPrice: number;
  takeProfitPrice: number;
  tradeMode?: "SCALP" | "DAYTRADE" | "SWING";
}): LivePosition {
  return {
    id: generateId(),
    symbol: params.symbol,
    contractSymbol: params.contractSymbol,
    type: params.type,
    strike: params.strike,
    expiry: params.expiry,
    entryPrice: params.entryPrice,
    currentPrice: params.entryPrice,
    quantity: params.quantity,
    entryTime: new Date().toISOString(),
    signalScore: params.signalScore,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    stopPrice: params.stopPrice,
    takeProfitPrice: params.takeProfitPrice,
    highWaterMark: params.entryPrice,
    exitSignalActive: false,
    exitSignalReason: "",
    tradeMode: params.tradeMode || "DAYTRADE",
  };
}

/**
 * Convert a closed LivePosition into a PaperTrade record
 */
export function positionToTrade(
  position: LivePosition,
  exitPrice: number,
  exitReason: string
): PaperTrade {
  const pnl = (exitPrice - position.entryPrice) * position.quantity * 100;
  const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

  return {
    id: position.id,
    symbol: position.symbol,
    type: position.type,
    strike: position.strike,
    expiry: position.expiry,
    entryPrice: position.entryPrice,
    exitPrice,
    quantity: position.quantity,
    entryTime: position.entryTime,
    exitTime: new Date().toISOString(),
    status: "CLOSED",
    signalScore: position.signalScore,
    pnl,
    pnlPercent,
    exitReason,
    source: "SYSTEM",
  };
}

/**
 * Create an execution log entry
 */
export function createExecution(params: {
  tradeId: string;
  symbol: string;
  action: AutoTradeExecution["action"];
  reason: string;
  signalScore: number;
  price: number;
  quantity: number;
  contractInfo?: AutoTradeExecution["contractInfo"];
}): AutoTradeExecution {
  return {
    id: generateId(),
    ...params,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Initialize or get today's daily stats
 */
export function getOrCreateDailyStats(existing?: DailyStats): DailyStats {
  const today = todayKey();

  if (existing && existing.date === today) return existing;

  return {
    date: today,
    tradesOpened: 0,
    tradesClosed: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    winCount: 0,
    lossCount: 0,
    maxDrawdown: 0,
    isLocked: false,
  };
}

/**
 * Update daily stats after a trade closes
 */
export function updateDailyStats(
  stats: DailyStats,
  pnl: number,
  maxDailyLoss: number
): DailyStats {
  const updated = {
    ...stats,
    tradesClosed: stats.tradesClosed + 1,
    realizedPnl: stats.realizedPnl + pnl,
    winCount: pnl > 0 ? stats.winCount + 1 : stats.winCount,
    lossCount: pnl <= 0 ? stats.lossCount + 1 : stats.lossCount,
    maxDrawdown: Math.min(stats.maxDrawdown, stats.realizedPnl + pnl),
  };

  // Check daily loss limit
  if (updated.realizedPnl <= -maxDailyLoss) {
    updated.isLocked = true;
  }

  return updated;
}
