// ============================================================
// QUANT EDGE — Report Generator
// Morning briefing, EOD report, and weekly summary
// ============================================================

import { PaperTrade, CompositeSignal, Quote } from "./types";
import { RegimeInfo } from "./regime";
import { comparePerformance, PerformanceStats } from "./grading";

// ── Morning Briefing (8C) ───────────────────────────────────

export interface MorningBriefing {
  date: string;
  marketOutlook: string;
  vixLevel: number;
  spyDirection: string;
  regime: string;
  events: Array<{ type: string; symbol?: string; description: string; time?: string }>;
  yesterdayRecap: {
    userPnl: number;
    systemPnl: number;
    userTrades: number;
    systemTrades: number;
    bestTrade: string;
    worstTrade: string;
    lesson: string;
  };
  watchlistPreview: Array<{ symbol: string; quantRank?: number }>;
  gamePlan: string;
  fullText: string; // formatted for Telegram
}

export function generateMorningBriefing(params: {
  spyQuote?: Quote | null;
  vixLevel: number;
  regime?: RegimeInfo | null;
  events: Array<{ type: string; symbol?: string; description: string; time?: string }>;
  yesterdayTrades: PaperTrade[];
  watchlist: Array<{ symbol: string; quantRank?: number }>;
}): MorningBriefing {
  const { spyQuote, vixLevel, regime, events, yesterdayTrades, watchlist } = params;
  const date = new Date().toISOString().slice(0, 10);

  // Market outlook
  const spyDir = spyQuote ? (spyQuote.changePercent > 0.3 ? "bullish" : spyQuote.changePercent < -0.3 ? "bearish" : "flat") : "unknown";
  const regimeLabel = regime?.regime === "LOW_VOL_TREND" ? "low-vol trending" :
    regime?.regime === "HIGH_VOL" ? "high volatility" :
    regime?.regime === "CRISIS" ? "crisis mode" : "normal";
  const marketOutlook = `SPY pre-market ${spyDir}, VIX at ${vixLevel.toFixed(1)}, market regime: ${regimeLabel}.`;

  // Yesterday recap
  const userYesterday = yesterdayTrades.filter((t) => t.source === "USER" && t.status === "CLOSED");
  const sysYesterday = yesterdayTrades.filter((t) => (t.source === "SYSTEM" || !t.source) && t.status === "CLOSED");
  const userPnl = userYesterday.reduce((s, t) => s + (t.pnl || 0), 0);
  const sysPnl = sysYesterday.reduce((s, t) => s + (t.pnl || 0), 0);

  const allYesterday = [...userYesterday, ...sysYesterday];
  const best = allYesterday.length > 0 ? allYesterday.sort((a, b) => (b.pnl || 0) - (a.pnl || 0))[0] : null;
  const worst = allYesterday.length > 0 ? allYesterday.sort((a, b) => (a.pnl || 0) - (b.pnl || 0))[0] : null;

  let lesson = "No trades yesterday — fresh start today.";
  if (allYesterday.length > 0) {
    const winRate = allYesterday.filter((t) => (t.pnl || 0) > 0).length / allYesterday.length * 100;
    if (winRate >= 60) lesson = "Good win rate yesterday — keep following the system.";
    else if (winRate >= 40) lesson = "Mixed results — review your entries and exits for patterns.";
    else lesson = "Rough day — focus on higher-conviction signals today and reduce size.";
  }

  // Game plan
  const topTickers = watchlist.slice(0, 5).map((w) => `${w.symbol}${w.quantRank ? ` (#${w.quantRank})` : ""}`);
  const gamePlan = topTickers.length > 0
    ? `Watch: ${topTickers.join(", ")}. Wait for VWAP reclaim at open before entering.`
    : "Add tickers to your watchlist to get a game plan.";

  // Format for Telegram
  const eventLines = events.length > 0
    ? events.map((e) => `  ${e.type === "earnings" ? "📊" : "⚠️"} ${e.description}${e.time ? ` @ ${e.time}` : ""}`).join("\n")
    : "  No major events today.";

  const fullText = `📊 *QUANTEDGE MORNING BRIEFING* — ${date}\n\n` +
    `*Market:* ${marketOutlook}\n\n` +
    `*Events Today:*\n${eventLines}\n\n` +
    `*Yesterday:* You: ${userPnl >= 0 ? "+" : ""}$${userPnl.toFixed(0)} (${userYesterday.length} trades) | System: ${sysPnl >= 0 ? "+" : ""}$${sysPnl.toFixed(0)} (${sysYesterday.length} trades)\n` +
    (best ? `Best: ${best.symbol} ${best.type} +$${(best.pnl || 0).toFixed(0)}\n` : "") +
    (worst && (worst.pnl || 0) < 0 ? `Worst: ${worst.symbol} ${worst.type} $${(worst.pnl || 0).toFixed(0)}\n` : "") +
    `💡 ${lesson}\n\n` +
    `*Game Plan:* ${gamePlan}`;

  return {
    date, marketOutlook, vixLevel, spyDirection: spyDir, regime: regimeLabel,
    events,
    yesterdayRecap: {
      userPnl, systemPnl: sysPnl,
      userTrades: userYesterday.length, systemTrades: sysYesterday.length,
      bestTrade: best ? `${best.symbol} +$${(best.pnl || 0).toFixed(0)}` : "none",
      worstTrade: worst ? `${worst.symbol} $${(worst.pnl || 0).toFixed(0)}` : "none",
      lesson,
    },
    watchlistPreview: watchlist.slice(0, 10),
    gamePlan, fullText,
  };
}

// ── End-of-Day Report (8D) ──────────────────────────────────

export interface EODReport {
  date: string;
  userPnl: number;
  systemPnl: number;
  userWinRate: number;
  systemWinRate: number;
  userTrades: PaperTrade[];
  systemTrades: PaperTrade[];
  riskCompliance: string;
  biggestMistake: string;
  educationTip: string;
  fullText: string;
}

export function generateEODReport(params: {
  allTrades: PaperTrade[];
  accountBalance: number;
  dailyLossLimit: number;
}): EODReport {
  const { allTrades, accountBalance, dailyLossLimit } = params;
  const today = new Date().toISOString().slice(0, 10);

  const todayUser = allTrades.filter((t) => t.source === "USER" && t.status === "CLOSED" && t.exitTime?.slice(0, 10) === today);
  const todaySystem = allTrades.filter((t) => (t.source === "SYSTEM" || !t.source) && t.status === "CLOSED" && t.exitTime?.slice(0, 10) === today);

  const userPnl = todayUser.reduce((s, t) => s + (t.pnl || 0), 0);
  const sysPnl = todaySystem.reduce((s, t) => s + (t.pnl || 0), 0);
  const userWins = todayUser.filter((t) => (t.pnl || 0) > 0).length;
  const sysWins = todaySystem.filter((t) => (t.pnl || 0) > 0).length;
  const userWinRate = todayUser.length > 0 ? (userWins / todayUser.length) * 100 : 0;
  const sysWinRate = todaySystem.length > 0 ? (sysWins / todaySystem.length) * 100 : 0;

  // Risk compliance
  const hitDailyLimit = Math.abs(userPnl) >= dailyLossLimit && userPnl < 0;
  const riskCompliance = hitDailyLimit
    ? `❌ Daily loss limit exceeded ($${Math.abs(userPnl).toFixed(0)} vs $${dailyLossLimit.toFixed(0)} limit)`
    : "✅ Stayed within risk limits today";

  // Biggest mistake
  let biggestMistake = "No major mistakes — solid execution today.";
  const worstUser = todayUser.sort((a, b) => (a.pnl || 0) - (b.pnl || 0))[0];
  if (worstUser && (worstUser.pnl || 0) < -20) {
    if (worstUser.signalScore < 50) {
      biggestMistake = `${worstUser.symbol} ${worstUser.type} — entered with weak signal (${worstUser.signalScore}). Wait for score ≥ 70.`;
    } else if ((worstUser.pnlPercent || 0) < -35) {
      biggestMistake = `${worstUser.symbol} ${worstUser.type} — held too long (${worstUser.pnlPercent?.toFixed(0)}% loss). Should have hit stop loss at -30%.`;
    } else {
      biggestMistake = `${worstUser.symbol} ${worstUser.type} — $${(worstUser.pnl || 0).toFixed(0)} loss. Review entry timing.`;
    }
  }

  // Education tip based on patterns
  let educationTip = "Keep following the system — consistency builds edge over time.";
  const userLosses = todayUser.filter((t) => (t.pnl || 0) < 0);
  if (userLosses.length >= 2) {
    const avgLossSignal = userLosses.reduce((s, t) => s + t.signalScore, 0) / userLosses.length;
    if (avgLossSignal < 60) educationTip = "Your losses came from weak signals. Only trade when score is 70+.";
    else educationTip = "Losses on decent signals — review exit timing. Are you holding through resistance?";
  }
  if (todayUser.length > 5) {
    educationTip = "You took 5+ trades today. Quality over quantity — try limiting to 3 high-conviction setups.";
  }

  // Trade-by-trade breakdown
  const tradeLines = [...todayUser, ...todaySystem]
    .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime())
    .slice(0, 10)
    .map((t) => {
      const src = t.source === "USER" ? "YOU" : "SYS";
      const pnl = (t.pnl || 0) >= 0 ? `+$${(t.pnl || 0).toFixed(0)}` : `$${(t.pnl || 0).toFixed(0)}`;
      return `  [${src}] ${t.symbol} ${t.type} ${pnl} (signal: ${t.signalScore})`;
    }).join("\n");

  const fullText = `📈 *QUANTEDGE EOD REPORT* — ${today}\n\n` +
    `*Your P&L:* ${userPnl >= 0 ? "+" : ""}$${userPnl.toFixed(0)} (${todayUser.length} trades, ${userWinRate.toFixed(0)}% win rate)\n` +
    `*System P&L:* ${sysPnl >= 0 ? "+" : ""}$${sysPnl.toFixed(0)} (${todaySystem.length} trades, ${sysWinRate.toFixed(0)}% win rate)\n\n` +
    `*Trades:*\n${tradeLines || "  No trades today."}\n\n` +
    `${riskCompliance}\n\n` +
    `*Biggest Mistake:* ${biggestMistake}\n\n` +
    `💡 *Tip:* ${educationTip}`;

  return {
    date: today, userPnl, systemPnl: sysPnl, userWinRate, systemWinRate: sysWinRate,
    userTrades: todayUser, systemTrades: todaySystem,
    riskCompliance, biggestMistake, educationTip, fullText,
  };
}

// ── Weekly Performance Report (8E) ──────────────────────────

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  userStats: PerformanceStats;
  systemStats: PerformanceStats;
  winner: "USER" | "SYSTEM" | "TIE";
  bestTrade: string;
  worstTrade: string;
  indicatorBreakdown: string;
  patternAnalysis: string;
  accountGrowth: number;
  fullText: string;
}

export function generateWeeklyReport(params: {
  allTrades: PaperTrade[];
  signals: Record<string, CompositeSignal>;
  startingBalance: number;
}): WeeklyReport {
  const { allTrades, signals, startingBalance } = params;

  // This week's date range
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const wsStr = weekStart.toISOString().slice(0, 10);
  const weStr = weekEnd.toISOString().slice(0, 10);

  const weekTrades = allTrades.filter((t) => {
    const d = (t.exitTime || t.entryTime).slice(0, 10);
    return d >= wsStr && d <= weStr && t.status === "CLOSED";
  });

  const userWeek = weekTrades.filter((t) => t.source === "USER");
  const sysWeek = weekTrades.filter((t) => t.source === "SYSTEM" || !t.source);
  const comparison = comparePerformance(userWeek, sysWeek);

  // Best/worst
  const allClosed = weekTrades.sort((a, b) => (b.pnl || 0) - (a.pnl || 0));
  const bestTrade = allClosed.length > 0 ? `${allClosed[0].symbol} ${allClosed[0].type} +$${(allClosed[0].pnl || 0).toFixed(0)}` : "none";
  const worstTrade = allClosed.length > 0 ? `${allClosed[allClosed.length - 1].symbol} ${allClosed[allClosed.length - 1].type} $${(allClosed[allClosed.length - 1].pnl || 0).toFixed(0)}` : "none";

  // Pattern analysis
  const callTrades = weekTrades.filter((t) => t.type === "CALL");
  const putTrades = weekTrades.filter((t) => t.type === "PUT");
  const callWR = callTrades.length > 0 ? (callTrades.filter((t) => (t.pnl || 0) > 0).length / callTrades.length * 100) : 0;
  const putWR = putTrades.length > 0 ? (putTrades.filter((t) => (t.pnl || 0) > 0).length / putTrades.length * 100) : 0;
  const callPnl = callTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const putPnl = putTrades.reduce((s, t) => s + (t.pnl || 0), 0);

  let patternAnalysis = "Not enough trades to identify patterns yet.";
  if (weekTrades.length >= 5) {
    if (callWR > putWR + 20) patternAnalysis = `You're better at calls (${callWR.toFixed(0)}% WR) than puts (${putWR.toFixed(0)}% WR). Consider focusing on bullish setups.`;
    else if (putWR > callWR + 20) patternAnalysis = `Puts are working better (${putWR.toFixed(0)}% WR) vs calls (${callWR.toFixed(0)}% WR). You might have an edge on the short side.`;
    else patternAnalysis = `Balanced performance — calls ${callWR.toFixed(0)}% WR ($${callPnl.toFixed(0)}), puts ${putWR.toFixed(0)}% WR ($${putPnl.toFixed(0)}).`;
  }

  // Indicator breakdown (which signals correlated with wins)
  const indicatorBreakdown = "Track more trades to see which indicators predict your wins best.";

  // Account growth
  const totalPnl = weekTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const accountGrowth = (totalPnl / startingBalance) * 100;

  const fullText = `📊 *QUANTEDGE WEEKLY REPORT* — ${wsStr} to ${weStr}\n\n` +
    `*Your P&L:* ${comparison.user.totalPnl >= 0 ? "+" : ""}$${comparison.user.totalPnl.toFixed(0)} (${comparison.user.totalTrades} trades, ${comparison.user.winRate.toFixed(0)}% WR)\n` +
    `*System P&L:* ${comparison.system.totalPnl >= 0 ? "+" : ""}$${comparison.system.totalPnl.toFixed(0)} (${comparison.system.totalTrades} trades, ${comparison.system.winRate.toFixed(0)}% WR)\n` +
    `*Winner:* ${comparison.winner === "TIE" ? "Tie" : comparison.winner === "USER" ? "You 🏆" : "System 🤖"}\n\n` +
    `*Best trade:* ${bestTrade}\n*Worst trade:* ${worstTrade}\n\n` +
    `*Patterns:* ${patternAnalysis}\n\n` +
    `*Account:* ${accountGrowth >= 0 ? "+" : ""}${accountGrowth.toFixed(1)}% this week\n\n` +
    `${comparison.summary}`;

  return {
    weekStart: wsStr, weekEnd: weStr,
    userStats: comparison.user, systemStats: comparison.system,
    winner: comparison.winner, bestTrade, worstTrade,
    indicatorBreakdown, patternAnalysis, accountGrowth, fullText,
  };
}
