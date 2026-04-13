// ============================================================
// QUANT EDGE — Multi-Timeframe Analysis (Phase 5)
// Confirms 5-min signals against daily and hourly trends
// ============================================================

import { Bar } from "./types";
import { calcEMA, calcRSI } from "./indicators";

export interface TimeframeBias {
  symbol: string;
  daily: TrendInfo;
  hourly: TrendInfo;
  alignment: "STRONG_BULL" | "BULL" | "NEUTRAL" | "BEAR" | "STRONG_BEAR";
  confirmationScore: number;  // 0-100, how much higher TFs support a long entry
  timestamp: string;
}

export interface TrendInfo {
  trend: "BULLISH" | "BEARISH" | "NEUTRAL";
  ema20: number;
  rsi: number;
  priceVsEma: number;  // % above/below 20 EMA
  strength: number;     // 0-100
}

/**
 * Analyze daily bars to determine the higher-timeframe trend
 */
export function analyzeDailyTrend(bars: Bar[]): TrendInfo {
  if (bars.length < 25) {
    return { trend: "NEUTRAL", ema20: 0, rsi: 50, priceVsEma: 0, strength: 50 };
  }

  const closes = bars.map((b) => b.close);
  const currentPrice = closes[closes.length - 1];

  const ema20 = calcEMA(closes, 20);
  const rsi = calcRSI(closes, 14);

  const currentEma = ema20[ema20.length - 1] || currentPrice;
  const currentRsi = rsi[rsi.length - 1] || 50;
  const priceVsEma = ((currentPrice - currentEma) / currentEma) * 100;

  // Trend determination
  let trend: TrendInfo["trend"] = "NEUTRAL";
  let strength = 50;

  if (priceVsEma > 1 && currentRsi > 50) {
    trend = "BULLISH";
    strength = Math.min(50 + priceVsEma * 10 + (currentRsi - 50), 100);
  } else if (priceVsEma < -1 && currentRsi < 50) {
    trend = "BEARISH";
    strength = Math.max(50 - Math.abs(priceVsEma) * 10 - (50 - currentRsi), 0);
  } else {
    strength = 50;
  }

  return { trend, ema20: currentEma, rsi: currentRsi, priceVsEma, strength };
}

/**
 * Analyze hourly bars (can be synthesized from 5-min bars)
 */
export function analyzeHourlyTrend(bars: Bar[]): TrendInfo {
  if (bars.length < 25) {
    return { trend: "NEUTRAL", ema20: 0, rsi: 50, priceVsEma: 0, strength: 50 };
  }

  return analyzeDailyTrend(bars); // Same logic, different timeframe input
}

/**
 * Synthesize hourly bars from 5-min bars
 */
export function synthesizeHourlyBars(fiveMinBars: Bar[]): Bar[] {
  if (fiveMinBars.length === 0) return [];

  const hourlyBars: Bar[] = [];
  let currentHour = "";
  let hourBar: Bar | null = null;

  for (const bar of fiveMinBars) {
    const barHour = bar.timestamp.slice(0, 13); // YYYY-MM-DDTHH

    if (barHour !== currentHour) {
      if (hourBar) hourlyBars.push(hourBar);
      currentHour = barHour;
      hourBar = { ...bar };
    } else if (hourBar) {
      hourBar.high = Math.max(hourBar.high, bar.high);
      hourBar.low = Math.min(hourBar.low, bar.low);
      hourBar.close = bar.close;
      hourBar.volume += bar.volume;
    }
  }

  if (hourBar) hourlyBars.push(hourBar);
  return hourlyBars;
}

/**
 * Get the full multi-timeframe bias for a symbol
 */
export function getTimeframeBias(
  symbol: string,
  dailyBars: Bar[],
  fiveMinBars: Bar[]
): TimeframeBias {
  const daily = analyzeDailyTrend(dailyBars);
  const hourlyBars = synthesizeHourlyBars(fiveMinBars);
  const hourly = analyzeHourlyTrend(hourlyBars);

  // Determine alignment
  let alignment: TimeframeBias["alignment"] = "NEUTRAL";
  let confirmationScore = 50;

  if (daily.trend === "BULLISH" && hourly.trend === "BULLISH") {
    alignment = "STRONG_BULL";
    confirmationScore = Math.min(75 + (daily.strength - 50) * 0.25 + (hourly.strength - 50) * 0.25, 100);
  } else if (daily.trend === "BULLISH" || hourly.trend === "BULLISH") {
    alignment = "BULL";
    confirmationScore = 60 + (daily.trend === "BULLISH" ? 10 : 0) + (hourly.trend === "BULLISH" ? 5 : 0);
  } else if (daily.trend === "BEARISH" && hourly.trend === "BEARISH") {
    alignment = "STRONG_BEAR";
    confirmationScore = Math.max(25 - (50 - daily.strength) * 0.25 - (50 - hourly.strength) * 0.25, 0);
  } else if (daily.trend === "BEARISH" || hourly.trend === "BEARISH") {
    alignment = "BEAR";
    confirmationScore = 35;
  }

  return {
    symbol,
    daily,
    hourly,
    alignment,
    confirmationScore,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Apply multi-timeframe filter to a signal score
 * Boosts or penalizes the 5-min signal based on higher TF alignment
 */
export function applyMTFFilter(
  originalScore: number,
  bias: TimeframeBias
): { adjustedScore: number; adjustment: number; reason: string } {
  let adjustment = 0;
  let reason = "";

  switch (bias.alignment) {
    case "STRONG_BULL":
      adjustment = 15;
      reason = "Daily + Hourly bullish — strong confirmation (+15)";
      break;
    case "BULL":
      adjustment = 8;
      reason = `${bias.daily.trend === "BULLISH" ? "Daily" : "Hourly"} bullish — partial confirmation (+8)`;
      break;
    case "NEUTRAL":
      adjustment = 0;
      reason = "Mixed timeframes — no adjustment";
      break;
    case "BEAR":
      adjustment = -15;
      reason = `${bias.daily.trend === "BEARISH" ? "Daily" : "Hourly"} bearish — trade against trend (-15)`;
      break;
    case "STRONG_BEAR":
      adjustment = -30;
      reason = "Daily + Hourly bearish — strong headwind (-30)";
      break;
  }

  const adjustedScore = Math.max(0, Math.min(100, originalScore + adjustment));

  return { adjustedScore, adjustment, reason };
}
