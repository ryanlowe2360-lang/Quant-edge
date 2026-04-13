// ============================================================
// QUANT EDGE — Market Regime & Key Levels (Phase 5)
// VIX-based regime detection, prior day levels, support/resistance
// ============================================================

import { Bar, Quote } from "./types";

// ── Market Regime ───────────────────────────────────────────

export type MarketRegime = "LOW_VOL_TREND" | "NORMAL" | "HIGH_VOL" | "CRISIS";

export interface RegimeInfo {
  regime: MarketRegime;
  vixLevel: number;
  spyTrend: "UP" | "DOWN" | "FLAT";
  thresholdAdjustment: number;   // adjust signal threshold by this amount
  riskMultiplier: number;        // scale position sizes by this
  description: string;
  timestamp: string;
}

/**
 * Determine market regime from VIX level and SPY trend
 */
export function detectRegime(vixPrice: number, spyChange: number): RegimeInfo {
  let regime: MarketRegime;
  let thresholdAdjustment: number;
  let riskMultiplier: number;
  let description: string;

  const spyTrend: RegimeInfo["spyTrend"] =
    spyChange > 0.3 ? "UP" : spyChange < -0.3 ? "DOWN" : "FLAT";

  if (vixPrice < 15) {
    regime = "LOW_VOL_TREND";
    thresholdAdjustment = -10;  // lower threshold = more trades in calm markets
    riskMultiplier = 1.2;       // can size up slightly
    description = "Low volatility trending market — favorable for momentum plays. Threshold lowered, risk increased.";
  } else if (vixPrice < 22) {
    regime = "NORMAL";
    thresholdAdjustment = 0;
    riskMultiplier = 1.0;
    description = "Normal volatility — standard parameters apply.";
  } else if (vixPrice < 35) {
    regime = "HIGH_VOL";
    thresholdAdjustment = 10;   // raise threshold = only strongest signals
    riskMultiplier = 0.6;       // reduce position sizes
    description = "Elevated volatility — only take highest-conviction signals. Position sizes reduced.";
  } else {
    regime = "CRISIS";
    thresholdAdjustment = 25;   // very high bar
    riskMultiplier = 0.3;       // minimal sizing
    description = "Extreme volatility (VIX 35+) — market in crisis mode. Minimal trading recommended.";
  }

  return {
    regime,
    vixLevel: vixPrice,
    spyTrend,
    thresholdAdjustment,
    riskMultiplier,
    description,
    timestamp: new Date().toISOString(),
  };
}

// ── Key Price Levels ────────────────────────────────────────

export interface KeyLevels {
  symbol: string;
  priorDayHigh: number;
  priorDayLow: number;
  priorDayClose: number;
  priorDayVwap: number;
  todayOpen: number;
  todayHigh: number;
  todayLow: number;
  preMarketHigh: number;
  preMarketLow: number;
  // Calculated levels
  pivotPoint: number;       // (H + L + C) / 3
  r1: number;               // 2*PP - L
  s1: number;               // 2*PP - H
  r2: number;               // PP + (H - L)
  s2: number;               // PP - (H - L)
  nearestResistance: number;
  nearestSupport: number;
  currentVsLevels: LevelContext;
}

export type LevelContext =
  | "ABOVE_ALL"           // above R2 — extended, avoid longs
  | "NEAR_RESISTANCE"     // within 0.5% of a resistance level
  | "MID_RANGE"           // between support and resistance
  | "NEAR_SUPPORT"        // within 0.5% of a support level
  | "BELOW_ALL";          // below S2 — oversold, potential bounce

/**
 * Calculate key levels from prior day and today's data
 */
export function calculateKeyLevels(
  symbol: string,
  priorDayBars: Bar[],
  todayBars: Bar[],
  currentPrice: number
): KeyLevels {
  // Prior day levels
  let priorDayHigh = 0, priorDayLow = Infinity, priorDayClose = 0, priorDayVwap = 0;

  if (priorDayBars.length > 0) {
    priorDayHigh = Math.max(...priorDayBars.map((b) => b.high));
    priorDayLow = Math.min(...priorDayBars.map((b) => b.low));
    priorDayClose = priorDayBars[priorDayBars.length - 1].close;

    // Calculate prior day VWAP
    let cumTPV = 0, cumVol = 0;
    for (const b of priorDayBars) {
      const tp = (b.high + b.low + b.close) / 3;
      cumTPV += tp * b.volume;
      cumVol += b.volume;
    }
    priorDayVwap = cumVol > 0 ? cumTPV / cumVol : priorDayClose;
  } else {
    priorDayHigh = currentPrice;
    priorDayLow = currentPrice;
    priorDayClose = currentPrice;
    priorDayVwap = currentPrice;
  }

  // Today's levels
  let todayOpen = currentPrice, todayHigh = currentPrice, todayLow = currentPrice;
  let preMarketHigh = 0, preMarketLow = Infinity;

  if (todayBars.length > 0) {
    todayOpen = todayBars[0].open;
    todayHigh = Math.max(...todayBars.map((b) => b.high));
    todayLow = Math.min(...todayBars.map((b) => b.low));

    // Pre-market = bars before 9:30 (simplified: first few bars)
    const preMkt = todayBars.slice(0, 3);
    if (preMkt.length > 0) {
      preMarketHigh = Math.max(...preMkt.map((b) => b.high));
      preMarketLow = Math.min(...preMkt.map((b) => b.low));
    }
  }

  // Pivot points
  const pivotPoint = (priorDayHigh + priorDayLow + priorDayClose) / 3;
  const r1 = 2 * pivotPoint - priorDayLow;
  const s1 = 2 * pivotPoint - priorDayHigh;
  const r2 = pivotPoint + (priorDayHigh - priorDayLow);
  const s2 = pivotPoint - (priorDayHigh - priorDayLow);

  // Nearest levels
  const resistanceLevels = [priorDayHigh, r1, r2, todayHigh].filter((l) => l > currentPrice).sort((a, b) => a - b);
  const supportLevels = [priorDayLow, s1, s2, todayLow, priorDayVwap].filter((l) => l < currentPrice).sort((a, b) => b - a);

  const nearestResistance = resistanceLevels[0] || currentPrice * 1.02;
  const nearestSupport = supportLevels[0] || currentPrice * 0.98;

  // Context
  const proximityThreshold = 0.005; // 0.5%
  let currentVsLevels: LevelContext = "MID_RANGE";

  if (currentPrice > r2) {
    currentVsLevels = "ABOVE_ALL";
  } else if (currentPrice < s2) {
    currentVsLevels = "BELOW_ALL";
  } else if (Math.abs(currentPrice - nearestResistance) / currentPrice < proximityThreshold) {
    currentVsLevels = "NEAR_RESISTANCE";
  } else if (Math.abs(currentPrice - nearestSupport) / currentPrice < proximityThreshold) {
    currentVsLevels = "NEAR_SUPPORT";
  }

  return {
    symbol,
    priorDayHigh,
    priorDayLow,
    priorDayClose,
    priorDayVwap,
    todayOpen,
    todayHigh,
    todayLow,
    preMarketHigh: preMarketHigh || todayOpen,
    preMarketLow: preMarketLow === Infinity ? todayOpen : preMarketLow,
    pivotPoint,
    r1, s1, r2, s2,
    nearestResistance,
    nearestSupport,
    currentVsLevels,
  };
}

/**
 * Apply key levels filter to signal score
 * Boosts signals near support, penalizes near resistance
 */
export function applyLevelsFilter(
  originalScore: number,
  levels: KeyLevels
): { adjustedScore: number; adjustment: number; reason: string } {
  let adjustment = 0;
  let reason = "";

  switch (levels.currentVsLevels) {
    case "NEAR_SUPPORT":
      adjustment = 10;
      reason = `Near support ($${levels.nearestSupport.toFixed(2)}) — bounce likely (+10)`;
      break;
    case "MID_RANGE":
      adjustment = 0;
      reason = "Mid-range — no level adjustment";
      break;
    case "NEAR_RESISTANCE":
      adjustment = -10;
      reason = `Near resistance ($${levels.nearestResistance.toFixed(2)}) — may reject (-10)`;
      break;
    case "ABOVE_ALL":
      adjustment = -15;
      reason = "Above all pivots — extended, risky entry (-15)";
      break;
    case "BELOW_ALL":
      adjustment = 5;
      reason = "Below all pivots — deep value if fundamentals hold (+5)";
      break;
  }

  return {
    adjustedScore: Math.max(0, Math.min(100, originalScore + adjustment)),
    adjustment,
    reason,
  };
}
