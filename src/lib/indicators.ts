// ============================================================
// QUANT EDGE — Technical Indicators Engine
// Pure math functions, no API dependencies
// ============================================================

import { Bar, IndicatorSnapshot } from "./types";

/**
 * Calculate Exponential Moving Average
 */
export function calcEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  // SMA for first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);

  // EMA for remaining
  for (let i = period; i < prices.length; i++) {
    ema.push((prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }

  return ema;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calcRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];

  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // First average
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  // Smoothed averages
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  return rsi;
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 * Resets at market open (9:30 AM ET) each day
 */
export function calcVWAP(bars: Bar[]): number[] {
  if (bars.length === 0) return [];

  const vwaps: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  let lastDate = "";

  for (const bar of bars) {
    // Detect new trading day — reset VWAP accumulator
    const barDate = bar.timestamp.slice(0, 10); // YYYY-MM-DD
    if (barDate !== lastDate) {
      cumulativeTPV = 0;
      cumulativeVolume = 0;
      lastDate = barDate;
    }

    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;

    vwaps.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice);
  }

  return vwaps;
}

/**
 * Calculate ATR (Average True Range)
 */
export function calcATR(bars: Bar[], period: number = 14): number[] {
  if (bars.length < period + 1) return [];

  const trueRanges: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trueRanges.push(tr);
  }

  const atrs: number[] = [];
  // First ATR is SMA
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  atrs.push(atr);

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    atrs.push(atr);
  }

  return atrs;
}

/**
 * Calculate relative volume (current bar volume vs average)
 */
export function calcRelativeVolume(bars: Bar[], lookback: number = 20): number {
  if (bars.length < lookback + 1) return 1;

  const recentBars = bars.slice(-lookback - 1, -1);
  const avgVolume = recentBars.reduce((sum, b) => sum + b.volume, 0) / recentBars.length;
  const currentVolume = bars[bars.length - 1].volume;

  return avgVolume > 0 ? currentVolume / avgVolume : 1;
}

/**
 * Generate a complete indicator snapshot for a symbol
 */
export function generateSnapshot(symbol: string, bars: Bar[]): IndicatorSnapshot | null {
  if (bars.length < 30) return null;

  const closes = bars.map((b) => b.close);
  const currentPrice = closes[closes.length - 1];

  // Calculate all indicators
  const vwaps = calcVWAP(bars);
  const rsiValues = calcRSI(closes, 14);
  const ema9Values = calcEMA(closes, 9);
  const ema21Values = calcEMA(closes, 21);
  const atrValues = calcATR(bars, 14);
  const relVol = calcRelativeVolume(bars, 20);

  const currentVwap = vwaps[vwaps.length - 1] || currentPrice;
  const currentRsi = rsiValues[rsiValues.length - 1] || 50;
  const currentEma9 = ema9Values[ema9Values.length - 1] || currentPrice;
  const currentEma21 = ema21Values[ema21Values.length - 1] || currentPrice;
  const currentAtr = atrValues[atrValues.length - 1] || 0;

  const priceVsVwap = currentVwap > 0
    ? ((currentPrice - currentVwap) / currentVwap) * 100
    : 0;

  return {
    symbol,
    timestamp: bars[bars.length - 1].timestamp,
    vwap: currentVwap,
    rsi: currentRsi,
    ema9: currentEma9,
    ema21: currentEma21,
    relativeVolume: relVol,
    atr: currentAtr,
    priceVsVwap,
  };
}

/**
 * Detect if RSI just bounced from oversold
 * Looks at last N RSI values for dip-then-recovery pattern
 */
export function detectRSIBounce(rsiValues: number[], oversoldLevel: number = 30): {
  bouncing: boolean;
  lowestRSI: number;
  currentRSI: number;
} {
  if (rsiValues.length < 5) return { bouncing: false, lowestRSI: 50, currentRSI: 50 };

  const recent = rsiValues.slice(-5);
  const current = recent[recent.length - 1];
  const lowest = Math.min(...recent);

  // Was oversold in last 5 bars AND now recovering
  const bouncing = lowest < oversoldLevel && current > lowest && current < 50;

  return { bouncing, lowestRSI: lowest, currentRSI: current };
}

/**
 * Detect EMA 9/21 crossover
 */
export function detectEMACross(
  ema9: number[],
  ema21: number[]
): { crossed: boolean; direction: "BULLISH" | "BEARISH" | "NONE" } {
  if (ema9.length < 2 || ema21.length < 2) {
    return { crossed: false, direction: "NONE" };
  }

  const prev9 = ema9[ema9.length - 2];
  const curr9 = ema9[ema9.length - 1];
  const prev21 = ema21[ema21.length - 2];
  const curr21 = ema21[ema21.length - 1];

  if (prev9 <= prev21 && curr9 > curr21) {
    return { crossed: true, direction: "BULLISH" };
  }
  if (prev9 >= prev21 && curr9 < curr21) {
    return { crossed: true, direction: "BEARISH" };
  }

  return { crossed: false, direction: "NONE" };
}

/**
 * Detect VWAP reclaim (price was below, now crossing above)
 */
export function detectVWAPReclaim(
  closes: number[],
  vwaps: number[]
): { reclaimed: boolean; strength: number } {
  if (closes.length < 3 || vwaps.length < 3) {
    return { reclaimed: false, strength: 0 };
  }

  const len = closes.length;
  const prevBelow = closes[len - 3] < vwaps[len - 3] || closes[len - 2] < vwaps[len - 2];
  const nowAbove = closes[len - 1] > vwaps[len - 1];

  if (prevBelow && nowAbove) {
    // Strength = how far above VWAP (as % of ATR would be better, but simple % works)
    const strength = ((closes[len - 1] - vwaps[len - 1]) / vwaps[len - 1]) * 100;
    return { reclaimed: true, strength: Math.min(strength * 50, 100) };
  }

  return { reclaimed: false, strength: 0 };
}
