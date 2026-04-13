// ============================================================
// QUANT EDGE — User Risk Management Engine (Phase 7)
// Warnings and guardrails for the user's manual trades
// ============================================================

import { PaperTrade } from "./types";

export interface RiskSettings {
  maxRiskPerTradePct: number;    // default 30%
  dailyLossLimitPct: number;     // default 10%
  consecutiveLossWarn: number;   // default 2
  consecutiveLossStop: number;   // default 3
  maxSimultaneous: number;       // default 2 (cash account)
  minBalanceReservePct: number;  // default 20%
  revengeCooldownMin: number;    // default 5
  dailyTradeLimit: number;       // default 3
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  maxRiskPerTradePct: 30,
  dailyLossLimitPct: 10,
  consecutiveLossWarn: 2,
  consecutiveLossStop: 3,
  maxSimultaneous: 2,
  minBalanceReservePct: 20,
  revengeCooldownMin: 5,
  dailyTradeLimit: 3,
};

export interface RiskWarning {
  id: string;
  type: "MAX_RISK" | "DAILY_LOSS" | "CONSECUTIVE_LOSS" | "MAX_POSITIONS" | "LOW_BALANCE" | "REVENGE_TRADE" | "DAILY_LIMIT";
  severity: "INFO" | "WARNING" | "DANGER" | "BLOCK";
  message: string;
  detail: string;
  timestamp: string;
}

/**
 * Run ALL risk checks before a user opens a new trade.
 * Returns an array of warnings (empty = all clear).
 */
export function checkRiskBeforeTrade(params: {
  contractCost: number;          // total cost of the trade (ask * 100 * qty)
  accountBalance: number;
  openUserTrades: PaperTrade[];  // currently open user trades
  allUserTrades: PaperTrade[];   // all user trades (for loss tracking)
  settings: RiskSettings;
}): RiskWarning[] {
  const { contractCost, accountBalance, openUserTrades, allUserTrades, settings } = params;
  const warnings: RiskWarning[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // ── 7.1: Max risk per trade ──────────────────────────────
  const riskPct = (contractCost / accountBalance) * 100;
  if (riskPct > settings.maxRiskPerTradePct) {
    warnings.push({
      id: `risk-${Date.now()}-1`,
      type: "MAX_RISK",
      severity: riskPct > 50 ? "DANGER" : "WARNING",
      message: `This trade risks ${riskPct.toFixed(0)}% of your account`,
      detail: `You're risking $${contractCost.toFixed(0)} on a $${accountBalance.toFixed(0)} account. ` +
        `Your limit is ${settings.maxRiskPerTradePct}% ($${(accountBalance * settings.maxRiskPerTradePct / 100).toFixed(0)}). ` +
        (riskPct > 50 ? "This is extremely risky — consider reducing quantity." : "Consider reducing to 1 contract."),
      timestamp: new Date().toISOString(),
    });
  }

  // ── 7.2: Daily loss limit ────────────────────────────────
  const todayClosed = allUserTrades.filter(
    (t) => t.status === "CLOSED" && t.source === "USER" && t.exitTime?.slice(0, 10) === today
  );
  const todayPnl = todayClosed.reduce((s, t) => s + (t.pnl || 0), 0);
  const dailyLossLimit = accountBalance * (settings.dailyLossLimitPct / 100);
  const dailyLossPct = Math.abs(todayPnl) / accountBalance * 100;

  if (todayPnl < 0) {
    if (Math.abs(todayPnl) >= dailyLossLimit) {
      warnings.push({
        id: `risk-${Date.now()}-2`,
        type: "DAILY_LOSS",
        severity: "DANGER",
        message: `Daily loss limit reached: -$${Math.abs(todayPnl).toFixed(0)}`,
        detail: `You've lost $${Math.abs(todayPnl).toFixed(0)} today (${dailyLossPct.toFixed(0)}% of account). ` +
          `Your daily limit is ${settings.dailyLossLimitPct}% ($${dailyLossLimit.toFixed(0)}). Stop trading for today.`,
        timestamp: new Date().toISOString(),
      });
    } else if (Math.abs(todayPnl) >= dailyLossLimit * 0.7) {
      warnings.push({
        id: `risk-${Date.now()}-2b`,
        type: "DAILY_LOSS",
        severity: "WARNING",
        message: `Approaching daily loss limit: -$${Math.abs(todayPnl).toFixed(0)}`,
        detail: `You're at ${dailyLossPct.toFixed(0)}% daily loss. Limit is ${settings.dailyLossLimitPct}%. Tread carefully.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ── 7.3 & 7.4: Consecutive losses ───────────────────────
  const recentClosed = allUserTrades
    .filter((t) => t.status === "CLOSED" && t.source === "USER")
    .sort((a, b) => new Date(b.exitTime || 0).getTime() - new Date(a.exitTime || 0).getTime());

  let consecutiveLosses = 0;
  for (const t of recentClosed) {
    if ((t.pnl || 0) < 0) consecutiveLosses++;
    else break;
  }

  if (consecutiveLosses >= settings.consecutiveLossStop) {
    warnings.push({
      id: `risk-${Date.now()}-3`,
      type: "CONSECUTIVE_LOSS",
      severity: "DANGER",
      message: `${consecutiveLosses} consecutive losses — consider stopping`,
      detail: `You've lost ${consecutiveLosses} trades in a row. This is a strong signal to step away, review your trades, and come back fresh. Continuing to trade on tilt almost always leads to bigger losses.`,
      timestamp: new Date().toISOString(),
    });
  } else if (consecutiveLosses >= settings.consecutiveLossWarn) {
    warnings.push({
      id: `risk-${Date.now()}-3b`,
      type: "CONSECUTIVE_LOSS",
      severity: "WARNING",
      message: `${consecutiveLosses} losses in a row — slow down`,
      detail: `Review your last ${consecutiveLosses} trades before taking another. Are you following the system or trading emotionally?`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── 7.5: Max simultaneous positions ──────────────────────
  const openCount = openUserTrades.filter((t) => t.status === "OPEN").length;
  if (openCount >= settings.maxSimultaneous) {
    warnings.push({
      id: `risk-${Date.now()}-4`,
      type: "MAX_POSITIONS",
      severity: "BLOCK",
      message: `Max ${settings.maxSimultaneous} positions reached`,
      detail: `You have ${openCount} open positions. Cash account rules limit you to ${settings.maxSimultaneous} simultaneous trades. Close a position before opening a new one.`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── 7.6: Minimum balance reserve ─────────────────────────
  const balanceAfterTrade = accountBalance - contractCost;
  const reserveAmount = accountBalance * (settings.minBalanceReservePct / 100);
  if (balanceAfterTrade < reserveAmount) {
    warnings.push({
      id: `risk-${Date.now()}-5`,
      type: "LOW_BALANCE",
      severity: "WARNING",
      message: `Account below safety reserve after this trade`,
      detail: `Balance would drop to $${balanceAfterTrade.toFixed(0)}, below your ${settings.minBalanceReservePct}% reserve ($${reserveAmount.toFixed(0)}). ` +
        `Keeping a reserve protects you from being unable to take good setups later.`,
      timestamp: new Date().toISOString(),
    });
  }

  // ── 7.7: Revenge trade detection ─────────────────────────
  const lastLoss = recentClosed.find((t) => (t.pnl || 0) < 0);
  if (lastLoss && lastLoss.exitTime) {
    const minutesSinceLoss = (Date.now() - new Date(lastLoss.exitTime).getTime()) / 60000;
    if (minutesSinceLoss < settings.revengeCooldownMin) {
      const remaining = Math.ceil(settings.revengeCooldownMin - minutesSinceLoss);
      warnings.push({
        id: `risk-${Date.now()}-6`,
        type: "REVENGE_TRADE",
        severity: "WARNING",
        message: `Cool-down: ${remaining} min since last loss`,
        detail: `You lost on your last trade ${minutesSinceLoss.toFixed(0)} minutes ago. ` +
          `Wait at least ${settings.revengeCooldownMin} minutes before trading again. ` +
          `Revenge trading — trying to "make it back" — is the #1 account killer.`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ── 7.8: Daily trade limit ───────────────────────────────
  const todayTradeCount = allUserTrades.filter(
    (t) => t.source === "USER" && t.entryTime.slice(0, 10) === today
  ).length;

  if (todayTradeCount >= settings.dailyTradeLimit) {
    warnings.push({
      id: `risk-${Date.now()}-7`,
      type: "DAILY_LIMIT",
      severity: "WARNING",
      message: `Daily trade limit reached (${todayTradeCount}/${settings.dailyTradeLimit})`,
      detail: `You've taken ${todayTradeCount} trades today. Your limit is ${settings.dailyTradeLimit}. ` +
        `Quality over quantity — fewer, higher-conviction trades typically outperform.`,
      timestamp: new Date().toISOString(),
    });
  }

  return warnings;
}

/**
 * Get a dashboard-level risk status summary
 */
export function getRiskStatus(params: {
  accountBalance: number;
  allUserTrades: PaperTrade[];
  openUserTrades: PaperTrade[];
  settings: RiskSettings;
}): {
  status: "GREEN" | "YELLOW" | "RED";
  todayPnl: number;
  todayTradeCount: number;
  consecutiveLosses: number;
  openPositions: number;
  warnings: string[];
} {
  const { accountBalance, allUserTrades, openUserTrades, settings } = params;
  const today = new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];

  const todayClosed = allUserTrades.filter(
    (t) => t.status === "CLOSED" && t.source === "USER" && t.exitTime?.slice(0, 10) === today
  );
  const todayPnl = todayClosed.reduce((s, t) => s + (t.pnl || 0), 0);
  const todayTradeCount = allUserTrades.filter(
    (t) => t.source === "USER" && t.entryTime.slice(0, 10) === today
  ).length;

  const recentClosed = allUserTrades
    .filter((t) => t.status === "CLOSED" && t.source === "USER")
    .sort((a, b) => new Date(b.exitTime || 0).getTime() - new Date(a.exitTime || 0).getTime());

  let consecutiveLosses = 0;
  for (const t of recentClosed) {
    if ((t.pnl || 0) < 0) consecutiveLosses++;
    else break;
  }

  const openPositions = openUserTrades.filter((t) => t.status === "OPEN").length;
  const dailyLossLimit = accountBalance * (settings.dailyLossLimitPct / 100);

  let status: "GREEN" | "YELLOW" | "RED" = "GREEN";

  if (Math.abs(todayPnl) >= dailyLossLimit && todayPnl < 0) {
    status = "RED";
    warnings.push("Daily loss limit reached");
  }
  if (consecutiveLosses >= settings.consecutiveLossStop) {
    status = "RED";
    warnings.push(`${consecutiveLosses} consecutive losses`);
  }
  if (consecutiveLosses >= settings.consecutiveLossWarn && status !== "RED") {
    status = "YELLOW";
    warnings.push(`${consecutiveLosses} losses in a row`);
  }
  if (todayPnl < 0 && Math.abs(todayPnl) >= dailyLossLimit * 0.7 && status === "GREEN") {
    status = "YELLOW";
    warnings.push("Approaching daily loss limit");
  }
  if (todayTradeCount >= settings.dailyTradeLimit && status === "GREEN") {
    status = "YELLOW";
    warnings.push("Daily trade limit reached");
  }

  return { status, todayPnl, todayTradeCount, consecutiveLosses, openPositions, warnings };
}
