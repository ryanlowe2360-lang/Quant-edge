// ============================================================
// QUANT EDGE — Trade Grading Engine
// Grades each trade A-F with criteria breakdown and explanation
// ============================================================

import { PaperTrade, CompositeSignal } from "./types";

interface GradeResult {
  grade: "A" | "B" | "C" | "D" | "F";
  totalPoints: number; // 0-100
  breakdown: {
    entryTiming: number;     // 0-25
    exitTiming: number;      // 0-25
    positionSizing: number;  // 0-20
    signalAdherence: number; // 0-15
    marketAlignment: number; // 0-15
  };
  explanation: string;
}

/**
 * Grade a closed trade based on multiple criteria
 */
export function gradeTrade(
  trade: PaperTrade,
  signalAtEntry?: CompositeSignal,
  accountBalance: number = 500
): GradeResult {
  const breakdown = {
    entryTiming: 0,
    exitTiming: 0,
    positionSizing: 0,
    signalAdherence: 0,
    marketAlignment: 0,
  };
  const explanations: string[] = [];

  // ── 1. Entry Timing (0-25 points) ────────────────────────
  // Did you enter when the signal was strong?
  const entryScore = trade.signalScore || 0;
  if (entryScore >= 80) {
    breakdown.entryTiming = 25;
    explanations.push("Entry timing: excellent — entered on a strong signal (80+).");
  } else if (entryScore >= 70) {
    breakdown.entryTiming = 20;
    explanations.push("Entry timing: good — signal was above threshold at entry.");
  } else if (entryScore >= 50) {
    breakdown.entryTiming = 12;
    explanations.push("Entry timing: fair — signal was moderate. Consider waiting for stronger setups.");
  } else if (entryScore >= 30) {
    breakdown.entryTiming = 5;
    explanations.push("Entry timing: poor — signal was weak at entry. This was a low-conviction trade.");
  } else {
    breakdown.entryTiming = 0;
    explanations.push("Entry timing: bad — no clear signal when you entered. Avoid trading without system confirmation.");
  }

  // ── 2. Exit Timing (0-25 points) ─────────────────────────
  // Profitable exit = good. How much profit captured?
  const pnlPct = trade.pnlPercent || 0;
  if (pnlPct >= 40) {
    breakdown.exitTiming = 25;
    explanations.push(`Exit timing: excellent — captured ${pnlPct.toFixed(0)}% gain. Great discipline.`);
  } else if (pnlPct >= 20) {
    breakdown.exitTiming = 22;
    explanations.push(`Exit timing: very good — ${pnlPct.toFixed(0)}% gain. Solid profit-taking.`);
  } else if (pnlPct > 0) {
    breakdown.exitTiming = 15;
    explanations.push(`Exit timing: decent — small ${pnlPct.toFixed(0)}% gain. Consider holding longer on strong signals.`);
  } else if (pnlPct > -15) {
    breakdown.exitTiming = 10;
    explanations.push(`Exit timing: acceptable — small ${pnlPct.toFixed(0)}% loss. Quick cut, good risk management.`);
  } else if (pnlPct > -30) {
    breakdown.exitTiming = 5;
    explanations.push(`Exit timing: late — ${pnlPct.toFixed(0)}% loss. Should have cut sooner at the stop loss level.`);
  } else {
    breakdown.exitTiming = 0;
    explanations.push(`Exit timing: poor — ${pnlPct.toFixed(0)}% loss. This exceeded your stop loss. Always honor your stops.`);
  }

  // ── 3. Position Sizing (0-20 points) ─────────────────────
  const tradeCost = trade.entryPrice * trade.quantity * 100;
  const riskPct = (tradeCost / accountBalance) * 100;

  if (riskPct <= 25) {
    breakdown.positionSizing = 20;
    explanations.push(`Position sizing: excellent — risked ${riskPct.toFixed(0)}% of account. Conservative and smart.`);
  } else if (riskPct <= 35) {
    breakdown.positionSizing = 15;
    explanations.push(`Position sizing: acceptable — risked ${riskPct.toFixed(0)}% of account. Within limits.`);
  } else if (riskPct <= 50) {
    breakdown.positionSizing = 8;
    explanations.push(`Position sizing: aggressive — risked ${riskPct.toFixed(0)}% of account. Consider smaller positions.`);
  } else {
    breakdown.positionSizing = 0;
    explanations.push(`Position sizing: dangerous — risked ${riskPct.toFixed(0)}% of account. Never risk more than 30% on a single trade.`);
  }

  // ── 4. Signal Adherence (0-15 points) ────────────────────
  // Did you follow the system's direction?
  if (signalAtEntry) {
    const signalDir = signalAtEntry.direction;
    const tradeDir = trade.type === "CALL" ? "LONG" : "SHORT";
    if (signalDir === tradeDir) {
      breakdown.signalAdherence = 15;
      explanations.push("Signal adherence: perfect — traded in the system's recommended direction.");
    } else if (signalDir === "NEUTRAL") {
      breakdown.signalAdherence = 5;
      explanations.push("Signal adherence: risky — system was neutral but you took a trade anyway.");
    } else {
      breakdown.signalAdherence = 0;
      explanations.push(`Signal adherence: against system — system said ${signalDir} but you went ${tradeDir}. Trading against your system erodes edge.`);
    }
  } else {
    // No signal data — give partial credit
    breakdown.signalAdherence = 7;
    explanations.push("Signal adherence: unknown — no signal data available at time of entry.");
  }

  // ── 5. Market Alignment (0-15 points) ────────────────────
  if (signalAtEntry) {
    const marketSignal = signalAtEntry.signals.find((s) => s.type === "MARKET_ALIGNMENT");
    if (marketSignal && marketSignal.active) {
      const tradeDir = trade.type === "CALL" ? "LONG" : "SHORT";
      const marketBullish = marketSignal.bullish;
      const aligned = (tradeDir === "LONG" && marketBullish) || (tradeDir === "SHORT" && !marketBullish);
      if (aligned) {
        breakdown.marketAlignment = 15;
        explanations.push("Market alignment: excellent — traded with the broader market trend.");
      } else {
        breakdown.marketAlignment = 0;
        explanations.push("Market alignment: against trend — you traded against SPY direction. This reduces win probability significantly.");
      }
    } else {
      breakdown.marketAlignment = 8;
      explanations.push("Market alignment: neutral — SPY had no clear trend. Choppy markets reduce conviction.");
    }
  } else {
    breakdown.marketAlignment = 8;
    explanations.push("Market alignment: unknown — no market data available.");
  }

  // ── Calculate Final Grade ────────────────────────────────
  const totalPoints = breakdown.entryTiming + breakdown.exitTiming +
    breakdown.positionSizing + breakdown.signalAdherence + breakdown.marketAlignment;

  let grade: GradeResult["grade"];
  if (totalPoints >= 85) grade = "A";
  else if (totalPoints >= 70) grade = "B";
  else if (totalPoints >= 55) grade = "C";
  else if (totalPoints >= 40) grade = "D";
  else grade = "F";

  const gradeEmoji = { A: "🏆", B: "👍", C: "😐", D: "👎", F: "❌" };
  const summary = `Grade: ${grade} ${gradeEmoji[grade]} (${totalPoints}/100). `;
  const bestArea = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0];
  const worstArea = Object.entries(breakdown).sort((a, b) => a[1] - b[1])[0];

  const explanation = summary +
    `Strongest: ${formatArea(bestArea[0])}. ` +
    `Needs work: ${formatArea(worstArea[0])}. ` +
    explanations.join(" ");

  return { grade, totalPoints, breakdown, explanation };
}

function formatArea(area: string): string {
  const labels: Record<string, string> = {
    entryTiming: "entry timing",
    exitTiming: "exit timing",
    positionSizing: "position sizing",
    signalAdherence: "signal adherence",
    marketAlignment: "market alignment",
  };
  return labels[area] || area;
}

/**
 * Compare user trades vs system trades for a given period
 */
export function comparePerformance(
  userTrades: PaperTrade[],
  systemTrades: PaperTrade[]
): {
  user: PerformanceStats;
  system: PerformanceStats;
  winner: "USER" | "SYSTEM" | "TIE";
  summary: string;
} {
  const user = calcStats(userTrades);
  const system = calcStats(systemTrades);

  let winner: "USER" | "SYSTEM" | "TIE" = "TIE";
  if (user.totalPnl > system.totalPnl + 10) winner = "USER";
  else if (system.totalPnl > user.totalPnl + 10) winner = "SYSTEM";

  let summary = "";
  if (winner === "USER") {
    summary = `You outperformed the system by $${(user.totalPnl - system.totalPnl).toFixed(0)}. `;
  } else if (winner === "SYSTEM") {
    summary = `The system outperformed you by $${(system.totalPnl - user.totalPnl).toFixed(0)}. `;
  } else {
    summary = "You and the system performed about equally. ";
  }

  if (user.winRate > system.winRate) {
    summary += `Your win rate (${user.winRate.toFixed(0)}%) is higher, `;
  } else {
    summary += `System win rate (${system.winRate.toFixed(0)}%) is higher, `;
  }

  const userRR = user.avgLoss !== 0 ? Math.abs(user.avgWin / user.avgLoss) : 0;
  const sysRR = system.avgLoss !== 0 ? Math.abs(system.avgWin / system.avgLoss) : 0;
  summary += `risk/reward: yours ${userRR.toFixed(1)}:1 vs system ${sysRR.toFixed(1)}:1.`;

  return { user, system, winner, summary };
}

export interface PerformanceStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  expectancy: number;    // avg $ per trade
  profitFactor: number;  // gross wins / gross losses
}

function calcStats(trades: PaperTrade[]): PerformanceStats {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const wins = closed.filter((t) => (t.pnl || 0) > 0);
  const losses = closed.filter((t) => (t.pnl || 0) <= 0);
  const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossWins = wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));

  return {
    totalTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
    totalPnl,
    avgWin: wins.length > 0 ? grossWins / wins.length : 0,
    avgLoss: losses.length > 0 ? -grossLosses / losses.length : 0,
    bestTrade: closed.length > 0 ? Math.max(...closed.map((t) => t.pnl || 0)) : 0,
    worstTrade: closed.length > 0 ? Math.min(...closed.map((t) => t.pnl || 0)) : 0,
    expectancy: closed.length > 0 ? totalPnl / closed.length : 0,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0,
  };
}
