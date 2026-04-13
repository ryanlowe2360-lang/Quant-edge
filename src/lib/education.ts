// ============================================================
// QUANT EDGE — Education Engine (Phase 9)
// Contextual learning, mistake detection, study recommendations
// ============================================================

import { PaperTrade, CompositeSignal } from "./types";

// ── Greeks Education (9B) ───────────────────────────────────

export interface GreekExplanation {
  name: string;
  value: string;
  explanation: string;
  impact: string; // what it means for THIS trade specifically
}

export function explainGreeks(contract: {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  impliedVolatility: number;
  ask: number;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
}): GreekExplanation[] {
  const absDelta = Math.abs(contract.delta);
  const dte = Math.max(0, Math.ceil((new Date(contract.expiry + "T16:00:00").getTime() - Date.now()) / 86400000));
  const thetaPerHour = Math.abs(contract.theta) / 6.5;
  const iv = contract.impliedVolatility * 100;

  return [
    {
      name: "Delta",
      value: contract.delta.toFixed(3),
      explanation: `Delta measures how much your option moves per $1 move in the stock. A delta of ${absDelta.toFixed(2)} means for every $1 the stock moves ${contract.type === "CALL" ? "up" : "down"}, your option gains ~$${absDelta.toFixed(2)} (or $${(absDelta * 100).toFixed(0)} per contract).`,
      impact: absDelta >= 0.50
        ? "Higher delta = more expensive but higher probability of profit. You're paying for safety."
        : absDelta >= 0.35
        ? "Sweet spot — good balance between leverage and probability. Most experienced traders target this range."
        : "Lower delta = cheaper but riskier. The stock needs a bigger move for this to be profitable.",
    },
    {
      name: "Gamma",
      value: contract.gamma.toFixed(4),
      explanation: `Gamma measures how fast delta changes. With gamma at ${contract.gamma.toFixed(4)}, every $1 stock move changes your delta by ${contract.gamma.toFixed(4)}. Higher gamma = your option accelerates faster in your favor (or against you).`,
      impact: contract.gamma > 0.05
        ? "High gamma — this option is very sensitive to stock movement. Great for quick scalps, dangerous if the stock reverses."
        : "Moderate gamma — smooth acceleration. Less explosive but more predictable.",
    },
    {
      name: "Theta",
      value: `$${Math.abs(contract.theta).toFixed(3)}/day`,
      explanation: `Theta is time decay — your option loses $${Math.abs(contract.theta).toFixed(2)} per day ($${thetaPerHour.toFixed(3)} per hour) just from time passing. With ${dte} days to expiry, you'll lose ~$${(Math.abs(contract.theta) * Math.min(dte, 3)).toFixed(2)} over the next ${Math.min(dte, 3)} days if the stock doesn't move.`,
      impact: dte <= 1
        ? "⚠️ Theta is accelerating fast — 0-1 DTE options lose value rapidly. Exit quickly if the trade isn't working."
        : dte <= 3
        ? "Theta is significant but manageable for a ${dte}-day hold. Make sure the expected move outpaces the decay."
        : "Theta is mild with ${dte} days out. Time is on your side for momentum plays.",
    },
    {
      name: "Vega",
      value: contract.vega.toFixed(3),
      explanation: `Vega measures sensitivity to IV (volatility) changes. If IV increases by 1%, your option gains $${contract.vega.toFixed(2)} per share ($${(contract.vega * 100).toFixed(0)} per contract). If IV drops 1%, you lose that much.`,
      impact: iv > 60
        ? `⚠️ IV is elevated at ${iv.toFixed(0)}% — premiums are expensive. An IV crush (drop in volatility) could hurt even if the stock moves your way. Common after earnings.`
        : iv > 30
        ? `IV at ${iv.toFixed(0)}% is normal. Vega risk is moderate.`
        : `Low IV at ${iv.toFixed(0)}% — premiums are cheap. If volatility spikes, your position benefits from vega expansion.`,
    },
    {
      name: "IV",
      value: `${iv.toFixed(1)}%`,
      explanation: `Implied Volatility shows how much movement the market expects. ${iv.toFixed(0)}% IV means the market expects the stock to move ±${(iv / Math.sqrt(252)).toFixed(1)}% per day. Higher IV = more expensive options.`,
      impact: iv > 80
        ? "Extremely high IV — options are very expensive. Consider waiting for IV to cool down, or you're paying a premium for uncertain outcomes."
        : iv > 50
        ? "Elevated IV — be aware that you're paying more than usual. The stock needs a larger move to overcome the premium."
        : "Reasonable IV — premiums are fairly priced. Good entry conditions.",
    },
  ];
}

// ── Indicator Education (9A, 9C) ────────────────────────────

export const INDICATOR_EDUCATION: Record<string, {
  whatItIs: string;
  howToRead: string;
  bestFor: string;
  commonMistake: string;
}> = {
  VWAP_RECLAIM: {
    whatItIs: "VWAP (Volume Weighted Average Price) is the average price weighted by volume throughout the day. It represents the 'fair price' institutional traders benchmark against.",
    howToRead: "Bullish: price crosses ABOVE VWAP = institutions buying. Bearish: price falls BELOW VWAP = institutions selling. The reclaim (crossing back above after being below) is especially powerful.",
    bestFor: "Confirming institutional participation in a move. VWAP reclaims near the open (9:30-10:30) are the strongest signals.",
    commonMistake: "Trading VWAP reclaims in the last hour — by then VWAP is flat and reclaims are less meaningful.",
  },
  RSI_MOMENTUM: {
    whatItIs: "RSI (Relative Strength Index) measures momentum on a 0-100 scale. Below 30 = oversold (sellers exhausted). Above 70 = overbought (buyers exhausted).",
    howToRead: "Bullish: RSI bounces from below 30 — selling pressure fading. Bearish: RSI rejects from above 70 — buying momentum fading. The bounce/rejection is the signal, not just the level.",
    bestFor: "Catching reversals. Works best when combined with another signal (VWAP + RSI = high conviction).",
    commonMistake: "Buying because RSI is 'low' without waiting for the bounce. RSI can stay oversold while price keeps falling.",
  },
  EMA_CROSS: {
    whatItIs: "EMA (Exponential Moving Average) gives more weight to recent prices. The 9/21 cross compares short-term trend (9 bars) to medium-term (21 bars).",
    howToRead: "Bullish: 9 EMA crosses ABOVE 21 EMA = momentum shifting up. Bearish: 9 EMA crosses BELOW 21 EMA = momentum shifting down. A fresh cross is stronger than an existing alignment.",
    bestFor: "Identifying trend shifts early. Best on 5-min charts for intraday options.",
    commonMistake: "Chasing old crosses. If the cross happened 30+ minutes ago, the move may already be priced in.",
  },
  VOLUME_SURGE: {
    whatItIs: "Volume Surge compares current volume to the 20-day average. 2x+ average = unusual activity, often institutional.",
    howToRead: "Volume surge + price up = bullish conviction (institutions buying). Volume surge + price down = bearish conviction (institutions selling). Low volume moves are unreliable.",
    bestFor: "Confirming that a price move has real backing. Always check volume direction — high volume alone means nothing.",
    commonMistake: "Ignoring volume direction. A 3x volume spike on a red candle is bearish, not bullish.",
  },
  PRICE_ACTION: {
    whatItIs: "Price Action reads the 'tape' — gaps, higher lows, lower highs, and how price interacts with the open and prior close.",
    howToRead: "Bullish: gap-ups holding, gap-downs being filled, higher lows forming. Bearish: gap-ups fading, gap-downs holding, lower highs forming.",
    bestFor: "Reading the intraday story. Price action is the ultimate confirmation — it shows you what's actually happening vs what indicators predict.",
    commonMistake: "Trading against the price action because an indicator says otherwise. If price is making lower lows, don't buy calls just because RSI looks oversold.",
  },
  MARKET_ALIGNMENT: {
    whatItIs: "Market Alignment checks if SPY/QQQ agrees with your trade direction. The broad market is the tide — individual stocks are boats.",
    howToRead: "SPY up + your stock up = aligned (high probability). SPY down + you're buying calls = fighting the tide (lower probability). Always check the market before entering.",
    bestFor: "Filtering out low-probability trades. Even great stock setups fail when the market is tanking.",
    commonMistake: "Ignoring SPY entirely. This is the most common mistake for new options traders — they focus only on the stock chart.",
  },
};

// ── Study Recommendations (9D) ──────────────────────────────

export interface StudyRecommendation {
  topic: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  resources: string;
}

export function generateStudyRecommendations(
  trades: PaperTrade[],
  signals: Record<string, CompositeSignal>
): StudyRecommendation[] {
  const recs: StudyRecommendation[] = [];
  const closed = trades.filter((t) => t.status === "CLOSED" && t.source === "USER");
  if (closed.length < 3) {
    recs.push({
      topic: "Getting Started with Signal-Based Trading",
      reason: "Take a few more trades so the system can identify your strengths and weaknesses.",
      priority: "MEDIUM",
      resources: "Watch the signal engine in action — pay attention to which indicators fire before big moves.",
    });
    return recs;
  }

  const losses = closed.filter((t) => (t.pnl || 0) < 0);
  const wins = closed.filter((t) => (t.pnl || 0) > 0);

  // Pattern: Low signal score entries
  const lowSignalLosses = losses.filter((t) => t.signalScore < 50);
  if (lowSignalLosses.length >= 2) {
    recs.push({
      topic: "Signal Discipline — Only Trade High-Conviction Setups",
      reason: `You lost ${lowSignalLosses.length} times on trades with signal scores below 50. These are low-conviction entries that reduce your edge.`,
      priority: "HIGH",
      resources: "Rule: Don't enter unless score is 70+. Review your losing trades — would you have avoided them by waiting for stronger signals?",
    });
  }

  // Pattern: Holding too long (big % losses)
  const bigLosses = losses.filter((t) => (t.pnlPercent || 0) < -35);
  if (bigLosses.length >= 2) {
    recs.push({
      topic: "Stop Loss Discipline — Cut Losers at -30%",
      reason: `You had ${bigLosses.length} trades with losses exceeding 35%. Holding losers hoping for recovery is the #1 account killer.`,
      priority: "HIGH",
      resources: "Set a hard rule: exit at -30% no matter what. The system suggests stop losses — follow them. The money you save on one bad trade funds two good ones.",
    });
  }

  // Pattern: Trading against market direction
  const recentTrades = closed.slice(0, 20);
  let againstMarket = 0;
  for (const t of recentTrades) {
    const sig = signals[t.symbol];
    if (sig) {
      const marketSignal = sig.signals.find((s) => s.type === "MARKET_ALIGNMENT");
      if (marketSignal) {
        const tradeDir = t.type === "CALL" ? "LONG" : "SHORT";
        const aligned = (tradeDir === "LONG" && marketSignal.bullish) || (tradeDir === "SHORT" && !marketSignal.bullish);
        if (!aligned && (t.pnl || 0) < 0) againstMarket++;
      }
    }
  }
  if (againstMarket >= 2) {
    recs.push({
      topic: "Market Regime Detection — Trade WITH the Trend",
      reason: `You lost ${againstMarket} times trading against the broader market direction. Going long when SPY is falling significantly reduces your win rate.`,
      priority: "HIGH",
      resources: "Before every trade, check the Market Pulse Bar. If SPY is bearish and you want calls, wait. If SPY is bullish and you want puts, reconsider.",
    });
  }

  // Pattern: Too many trades per day
  const tradeDates = new Map<string, number>();
  for (const t of closed) {
    const d = t.entryTime.slice(0, 10);
    tradeDates.set(d, (tradeDates.get(d) || 0) + 1);
  }
  const heavyDays = [...tradeDates.entries()].filter(([_, count]) => count > 5);
  if (heavyDays.length >= 2) {
    recs.push({
      topic: "Quality Over Quantity — Reduce Trade Frequency",
      reason: `You traded 5+ times on ${heavyDays.length} days. Overtrading dilutes your edge and increases commissions/spread costs.`,
      priority: "MEDIUM",
      resources: "Aim for 2-3 high-conviction trades per day. Your best trades are probably your first 1-2, not your 5th and 6th.",
    });
  }

  // Pattern: Calls vs Puts performance gap
  const callTrades = closed.filter((t) => t.type === "CALL");
  const putTrades = closed.filter((t) => t.type === "PUT");
  if (callTrades.length >= 3 && putTrades.length >= 3) {
    const callWR = callTrades.filter((t) => (t.pnl || 0) > 0).length / callTrades.length * 100;
    const putWR = putTrades.filter((t) => (t.pnl || 0) > 0).length / putTrades.length * 100;
    if (callWR > putWR + 25) {
      recs.push({
        topic: "Focus on Your Strength — Calls Outperform Your Puts",
        reason: `Call win rate: ${callWR.toFixed(0)}% vs Put win rate: ${putWR.toFixed(0)}%. Consider reducing put trades until you improve bearish reads.`,
        priority: "MEDIUM",
        resources: "Study bearish price action patterns: VWAP breakdowns, lower highs, failed gap-ups. Practice reading these before taking puts.",
      });
    } else if (putWR > callWR + 25) {
      recs.push({
        topic: "Focus on Your Strength — Puts Outperform Your Calls",
        reason: `Put win rate: ${putWR.toFixed(0)}% vs Call win rate: ${callWR.toFixed(0)}%. Your bearish reads are stronger than bullish.`,
        priority: "MEDIUM",
        resources: "Study bullish setups: VWAP reclaims, RSI bounces, gap-fill recoveries. Work on identifying momentum continuation patterns.",
      });
    }
  }

  // Pattern: Not following system direction
  let againstSystem = 0;
  for (const t of recentTrades) {
    const sig = signals[t.symbol];
    if (sig && sig.direction !== "NEUTRAL") {
      const tradeDir = t.type === "CALL" ? "LONG" : "SHORT";
      if (sig.direction !== tradeDir && (t.pnl || 0) < 0) againstSystem++;
    }
  }
  if (againstSystem >= 2) {
    recs.push({
      topic: "Trust the System — Follow Signal Direction",
      reason: `You lost ${againstSystem} times trading against the system's recommended direction. The signal engine is designed to read multiple indicators simultaneously.`,
      priority: "MEDIUM",
      resources: "When the system says LONG, only buy calls. When it says SHORT, only buy puts. When it says NEUTRAL, don't trade. Simple discipline = better results.",
    });
  }

  // Always include a positive note if they're doing well
  if (wins.length > losses.length && recs.length < 3) {
    recs.push({
      topic: "Keep It Up — You're Profitable",
      reason: `${wins.length} wins vs ${losses.length} losses. Your edge is working. Focus on consistency and position sizing as your account grows.`,
      priority: "LOW",
      resources: "Start journaling WHY your winning trades worked. Look for your personal 'A+ setup' that you can repeat.",
    });
  }

  return recs.sort((a, b) => {
    const p = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return p[a.priority] - p[b.priority];
  });
}

// ── Improvement Tracking (9.15) ─────────────────────────────

export function trackImprovement(
  recentTrades: PaperTrade[],  // last 2 weeks
  olderTrades: PaperTrade[]     // 2-4 weeks ago
): { improving: boolean; summary: string } {
  const recentClosed = recentTrades.filter((t) => t.status === "CLOSED" && t.source === "USER");
  const olderClosed = olderTrades.filter((t) => t.status === "CLOSED" && t.source === "USER");

  if (recentClosed.length < 5 || olderClosed.length < 5) {
    return { improving: false, summary: "Need more trade history to track improvement." };
  }

  const recentWR = recentClosed.filter((t) => (t.pnl || 0) > 0).length / recentClosed.length * 100;
  const olderWR = olderClosed.filter((t) => (t.pnl || 0) > 0).length / olderClosed.length * 100;
  const recentAvgSignal = recentClosed.reduce((s, t) => s + t.signalScore, 0) / recentClosed.length;
  const olderAvgSignal = olderClosed.reduce((s, t) => s + t.signalScore, 0) / olderClosed.length;

  const wrImproved = recentWR > olderWR + 5;
  const signalImproved = recentAvgSignal > olderAvgSignal + 5;

  let summary = "";
  if (wrImproved && signalImproved) {
    summary = `Great progress! Win rate improved from ${olderWR.toFixed(0)}% to ${recentWR.toFixed(0)}%, and you're entering on stronger signals (avg ${recentAvgSignal.toFixed(0)} vs ${olderAvgSignal.toFixed(0)}).`;
  } else if (wrImproved) {
    summary = `Win rate improving: ${olderWR.toFixed(0)}% → ${recentWR.toFixed(0)}%. Keep being selective with entries.`;
  } else if (signalImproved) {
    summary = `Better signal discipline: avg entry score ${olderAvgSignal.toFixed(0)} → ${recentAvgSignal.toFixed(0)}. Results should follow.`;
  } else {
    summary = `Win rate ${recentWR.toFixed(0)}% (was ${olderWR.toFixed(0)}%). Review your study recommendations and focus on one area at a time.`;
  }

  return { improving: wrImproved || signalImproved, summary };
}
