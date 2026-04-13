// ============================================================
// QUANT EDGE — Signal Engine v2
// Scores both BULLISH and BEARISH setups per ticker
// Adds Market Alignment, confidence levels, plain English
// ============================================================

import { Bar, CompositeSignal, SignalDetail, SignalType } from "./types";
import {
  calcEMA,
  calcRSI,
  calcVWAP,
  calcRelativeVolume,
  detectEMACross,
  detectVWAPReclaim,
} from "./indicators";
import { synthesizeHourlyBars, analyzeHourlyTrend } from "./multiframe";
import { calculateKeyLevels } from "./regime";

// Signal weights per master plan (must sum to 100)
const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  VWAP_RECLAIM: 25,
  RSI_MOMENTUM: 20,
  EMA_CROSS: 20,
  VOLUME_SURGE: 15,
  PRICE_ACTION: 10,
  MARKET_ALIGNMENT: 10,
};

// Helper: detect VWAP breakdown (bearish mirror of reclaim)
function detectVWAPBreakdown(closes: number[], vwaps: number[]): { broken: boolean; strength: number } {
  if (closes.length < 3 || vwaps.length < 3) return { broken: false, strength: 0 };
  const len = closes.length;
  const prevAbove = closes[len - 3] > vwaps[len - 3] || closes[len - 2] > vwaps[len - 2];
  const nowBelow = closes[len - 1] < vwaps[len - 1];
  if (prevAbove && nowBelow) {
    const strength = ((vwaps[len - 1] - closes[len - 1]) / vwaps[len - 1]) * 100;
    return { broken: true, strength: Math.min(strength * 50, 100) };
  }
  return { broken: false, strength: 0 };
}

/**
 * Run the full signal engine on intraday bars for a single symbol.
 * Scores both bullish AND bearish setups — direction goes to the stronger side.
 */
export function analyzeSymbol(symbol: string, bars: Bar[], spyBars?: Bar[]): CompositeSignal {
  const closes = bars.map((b) => b.close);

  if (bars.length < 30) {
    return {
      symbol, score: 0, direction: "NEUTRAL", confidence: "LOW",
      explanation: "Not enough data — need at least 30 bars to analyze.",
      signals: [], timestamp: new Date().toISOString(), optionsPlayable: false,
    };
  }

  const todayDate = bars[bars.length - 1].timestamp.slice(0, 10);
  const todayBars = bars.filter((b) => b.timestamp.slice(0, 10) === todayDate);
  const priorDayBars = bars.filter((b) => b.timestamp.slice(0, 10) !== todayDate);
  const currentPrice = closes[closes.length - 1];
  const priceChange = closes.length > 1 ? closes[closes.length - 1] - closes[closes.length - 2] : 0;

  const bullishSignals: SignalDetail[] = [];
  const bearishSignals: SignalDetail[] = [];

  // ── 1. VWAP (25%) ────────────────────────────────────────
  const vwaps = calcVWAP(bars);
  const currentVwap = vwaps[vwaps.length - 1];
  const priceVsVwap = ((currentPrice - currentVwap) / currentVwap) * 100;
  const vwapReclaim = detectVWAPReclaim(closes, vwaps);
  const vwapBreakdown = detectVWAPBreakdown(closes, vwaps);

  let vwapBullScore = 0;
  let vwapBearScore = 0;
  let vwapDesc = "";

  if (vwapReclaim.reclaimed) {
    vwapBullScore = Math.min(vwapReclaim.strength, 100);
    vwapDesc = `Price reclaimed VWAP (${priceVsVwap.toFixed(2)}% above) — institutional buyers stepping in. Large players are buying at the average price, confirming upward momentum.`;
  } else if (currentPrice > currentVwap) {
    vwapBullScore = 30;
    vwapDesc = `Price holding above VWAP (${priceVsVwap.toFixed(2)}% above) — bulls in control but no fresh reclaim.`;
  }

  if (vwapBreakdown.broken) {
    vwapBearScore = Math.min(vwapBreakdown.strength, 100);
    vwapDesc = `Price broke below VWAP (${priceVsVwap.toFixed(2)}%) — sellers taking control. Institutional selling pressure is pushing price below the volume-weighted average.`;
  } else if (currentPrice < currentVwap && vwapBullScore === 0) {
    vwapBearScore = 30;
    vwapDesc = `Price trading below VWAP (${priceVsVwap.toFixed(2)}%) — bearish positioning.`;
  }

  if (!vwapDesc) vwapDesc = `Price near VWAP (${priceVsVwap.toFixed(2)}%) — no clear signal.`;

  const vwapIsBullish = vwapBullScore >= vwapBearScore;
  const vwapSignal: SignalDetail = {
    type: "VWAP_RECLAIM", name: vwapIsBullish ? "VWAP Reclaim" : "VWAP Breakdown",
    score: vwapIsBullish ? vwapBullScore : vwapBearScore,
    active: vwapReclaim.reclaimed || vwapBreakdown.broken,
    bullish: vwapIsBullish, value: priceVsVwap, threshold: 0, description: vwapDesc,
  };
  (vwapIsBullish ? bullishSignals : bearishSignals).push(vwapSignal);

  // ── 2. RSI Momentum (20%) ────────────────────────────────
  const rsiValues = calcRSI(closes, 14);
  const currentRSI = rsiValues[rsiValues.length - 1] || 50;
  const recentRSI = rsiValues.slice(-5);
  const lowestRSI = recentRSI.length > 0 ? Math.min(...recentRSI) : 50;
  const highestRSI = recentRSI.length > 0 ? Math.max(...recentRSI) : 50;

  let rsiBullScore = 0;
  let rsiBearScore = 0;
  let rsiDesc = "";

  // Bullish: RSI bouncing from oversold
  if (lowestRSI < 30 && currentRSI > lowestRSI && currentRSI < 50) {
    rsiBullScore = Math.min(((30 - lowestRSI) / 30) * 100 + 40, 100);
    rsiDesc = `RSI bouncing from ${lowestRSI.toFixed(0)} to ${currentRSI.toFixed(0)} — selling pressure exhausting, buyers stepping in. Historically, RSI bounces from below 30 lead to short-term reversals roughly 65% of the time.`;
  } else if (currentRSI >= 30 && currentRSI < 40) {
    rsiBullScore = 30;
    rsiDesc = `RSI at ${currentRSI.toFixed(0)} — approaching oversold. Watch for a bounce above 35 to confirm buyer interest.`;
  }

  // Bearish: RSI rejecting from overbought
  if (highestRSI > 70 && currentRSI < highestRSI && currentRSI > 50) {
    rsiBearScore = Math.min(((highestRSI - 70) / 30) * 100 + 40, 100);
    rsiDesc = `RSI rejecting from ${highestRSI.toFixed(0)} to ${currentRSI.toFixed(0)} — buying momentum fading. Overbought rejection often precedes a pullback as profit-taking kicks in.`;
  } else if (currentRSI > 65 && currentRSI <= 70 && rsiBullScore === 0) {
    rsiBearScore = 25;
    rsiDesc = `RSI at ${currentRSI.toFixed(0)} — approaching overbought territory.`;
  }

  if (!rsiDesc) rsiDesc = `RSI at ${currentRSI.toFixed(0)} — neutral territory, no strong momentum signal.`;

  const rsiIsBullish = rsiBullScore >= rsiBearScore;
  const rsiSignal: SignalDetail = {
    type: "RSI_MOMENTUM", name: rsiIsBullish ? "RSI Oversold Bounce" : "RSI Overbought Rejection",
    score: rsiIsBullish ? rsiBullScore : rsiBearScore,
    active: rsiBullScore >= 40 || rsiBearScore >= 40,
    bullish: rsiIsBullish, value: currentRSI, threshold: rsiIsBullish ? 30 : 70, description: rsiDesc,
  };
  (rsiIsBullish ? bullishSignals : bearishSignals).push(rsiSignal);

  // ── 3. EMA 9/21 Cross (20%) ──────────────────────────────
  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const emaCross = detectEMACross(ema9, ema21);
  const currEma9 = ema9[ema9.length - 1] || 0;
  const currEma21 = ema21[ema21.length - 1] || 0;
  const emaSpread = currEma21 > 0 ? ((currEma9 - currEma21) / currEma21) * 100 : 0;

  let emaBullScore = 0;
  let emaBearScore = 0;
  let emaDesc = "";

  if (emaCross.crossed && emaCross.direction === "BULLISH") {
    emaBullScore = 100;
    emaDesc = `Bullish EMA crossover — the 9-period EMA just crossed above the 21-period EMA. This signals a short-term trend shift to the upside. Fresh crosses are the strongest signal.`;
  } else if (emaCross.crossed && emaCross.direction === "BEARISH") {
    emaBearScore = 100;
    emaDesc = `Bearish EMA crossover — the 9-period EMA just crossed below the 21-period EMA. This signals a short-term trend shift to the downside. Momentum is turning negative.`;
  } else if (currEma9 > currEma21) {
    emaBullScore = 40;
    emaDesc = `EMAs in bullish alignment (9 EMA ${emaSpread.toFixed(2)}% above 21 EMA) — uptrend intact but no fresh crossover.`;
  } else {
    emaBearScore = 40;
    emaDesc = `EMAs in bearish alignment (9 EMA ${Math.abs(emaSpread).toFixed(2)}% below 21 EMA) — downtrend intact.`;
  }

  const emaIsBullish = emaBullScore >= emaBearScore;
  const emaSignal: SignalDetail = {
    type: "EMA_CROSS", name: "9/21 EMA Cross",
    score: emaIsBullish ? emaBullScore : emaBearScore,
    active: emaCross.crossed,
    bullish: emaIsBullish, value: currEma9 - currEma21, threshold: 0, description: emaDesc,
  };
  (emaIsBullish ? bullishSignals : bearishSignals).push(emaSignal);

  // ── 4. Volume Surge (15%) ────────────────────────────────
  const relVol = calcRelativeVolume(bars, 20);
  let volScore = 0;
  if (relVol > 3.0) volScore = 100;
  else if (relVol > 2.0) volScore = 80;
  else if (relVol > 1.5) volScore = 50;
  else if (relVol > 1.2) volScore = 20;

  const volIsBullish = priceChange >= 0;
  let volDesc = "";

  if (relVol > 2.0 && volIsBullish) {
    volDesc = `${relVol.toFixed(1)}x average volume on an up move — unusual buying activity confirms bullish conviction. Volume this high often indicates institutional participation.`;
  } else if (relVol > 2.0 && !volIsBullish) {
    volDesc = `${relVol.toFixed(1)}x average volume on a down move — heavy selling pressure. Institutional sellers may be distributing shares.`;
  } else if (relVol > 1.5) {
    volDesc = `${relVol.toFixed(1)}x average volume — moderately elevated activity.`;
  } else {
    volDesc = `Volume at ${relVol.toFixed(1)}x average — quiet session, no unusual activity.`;
  }

  const volSignal: SignalDetail = {
    type: "VOLUME_SURGE", name: "Volume Surge",
    score: volScore, active: relVol > 2.0,
    bullish: volIsBullish, value: relVol, threshold: 2.0, description: volDesc,
  };
  (volIsBullish ? bullishSignals : bearishSignals).push(volSignal);

  // ── 5. Price Action (10%) ────────────────────────────────
  let paBullScore = 0;
  let paBearScore = 0;
  let paDesc = "No clear price action pattern detected today.";

  if (priorDayBars.length > 0 && todayBars.length >= 3) {
    const priorClose = priorDayBars[priorDayBars.length - 1].close;
    const todayOpen = todayBars[0].open;
    const gapPercent = ((todayOpen - priorClose) / priorClose) * 100;

    // Bullish patterns
    if (gapPercent > 1.0 && currentPrice > currentVwap && currentPrice > todayOpen) {
      paBullScore = Math.min(60 + gapPercent * 10, 100);
      paDesc = `Gapped up ${gapPercent.toFixed(1)}% and holding above VWAP and open — trend day pattern. Strong gaps that hold above VWAP typically continue higher.`;
    } else if (gapPercent < -0.5 && currentPrice > todayOpen) {
      const gapFill = ((currentPrice - todayOpen) / (priorClose - todayOpen)) * 100;
      paBullScore = Math.min(gapFill, 100);
      paDesc = `Gap down ${Math.abs(gapPercent).toFixed(1)}% being filled (${gapFill.toFixed(0)}% recovered) — buyers absorbing the sell-off.`;
    }

    // Bearish patterns
    if (gapPercent < -1.0 && currentPrice < currentVwap && currentPrice < todayOpen) {
      paBearScore = Math.min(60 + Math.abs(gapPercent) * 10, 100);
      paDesc = `Gapped down ${Math.abs(gapPercent).toFixed(1)}% and holding below VWAP — bearish trend day. Sellers remain in control.`;
    } else if (gapPercent > 0.5 && currentPrice < todayOpen && paBullScore === 0) {
      paBearScore = 60;
      paDesc = `Gap up ${gapPercent.toFixed(1)}% has faded below open — failed gap-ups often lead to reversals as buyers get trapped.`;
    }

    // Higher lows / lower highs
    if (todayBars.length >= 6 && paBullScore === 0 && paBearScore === 0) {
      const firstThird = todayBars.slice(0, Math.floor(todayBars.length / 3));
      const lastThird = todayBars.slice(-Math.floor(todayBars.length / 3));
      const firstLow = Math.min(...firstThird.map((b) => b.low));
      const lastLow = Math.min(...lastThird.map((b) => b.low));
      const firstHigh = Math.max(...firstThird.map((b) => b.high));
      const lastHigh = Math.max(...lastThird.map((b) => b.high));

      if (lastLow > firstLow && lastHigh > firstHigh) {
        paBullScore = 45;
        paDesc = "Making higher highs and higher lows — healthy uptrend structure.";
      } else if (lastHigh < firstHigh && lastLow < firstLow) {
        paBearScore = 45;
        paDesc = "Making lower highs and lower lows — downtrend structure forming.";
      }
    }
  }

  const paIsBullish = paBullScore >= paBearScore;
  const paSignal: SignalDetail = {
    type: "PRICE_ACTION", name: "Price Action",
    score: paIsBullish ? paBullScore : paBearScore,
    active: paBullScore >= 45 || paBearScore >= 45,
    bullish: paIsBullish, value: currentPrice, description: paDesc,
  };
  (paIsBullish ? bullishSignals : bearishSignals).push(paSignal);

  // ── 6. Market Alignment (10%) ────────────────────────────
  let maBullScore = 0;
  let maBearScore = 0;
  let maDesc = "No SPY data available — market alignment not scored.";

  if (spyBars && spyBars.length > 10) {
    const spyCloses = spyBars.map((b) => b.close);
    const spyPrice = spyCloses[spyCloses.length - 1];
    const spyOpen = spyCloses[0];
    const spyReturn = ((spyPrice - spyOpen) / spyOpen) * 100;
    const spyVwaps = calcVWAP(spyBars);
    const spyVwap = spyVwaps[spyVwaps.length - 1];
    const spyAboveVwap = spyPrice > spyVwap;
    const spyEma9 = calcEMA(spyCloses, 9);
    const spyEma21 = calcEMA(spyCloses, 21);
    const spyBullishEma = spyEma9.length > 0 && spyEma21.length > 0 && spyEma9[spyEma9.length - 1] > spyEma21[spyEma21.length - 1];

    let spyBullPoints = 0;
    if (spyReturn > 0.3) spyBullPoints += 30;
    if (spyAboveVwap) spyBullPoints += 35;
    if (spyBullishEma) spyBullPoints += 35;

    let spyBearPoints = 0;
    if (spyReturn < -0.3) spyBearPoints += 30;
    if (!spyAboveVwap) spyBearPoints += 35;
    if (!spyBullishEma) spyBearPoints += 35;

    if (spyBullPoints >= 65) {
      maBullScore = spyBullPoints;
      maDesc = `SPY trending up (${spyReturn >= 0 ? "+" : ""}${spyReturn.toFixed(2)}%, ${spyAboveVwap ? "above" : "below"} VWAP) — market supports long trades. Trading with the broader market significantly improves win rates.`;
    } else if (spyBearPoints >= 65) {
      maBearScore = spyBearPoints;
      maDesc = `SPY trending down (${spyReturn.toFixed(2)}%, ${spyAboveVwap ? "above" : "below"} VWAP) — market supports short/put trades. Going long against a falling market reduces your odds.`;
    } else {
      maDesc = `SPY choppy (${spyReturn >= 0 ? "+" : ""}${spyReturn.toFixed(2)}%) — no clear market direction. Consider reducing position size.`;
    }
  }

  const maIsBullish = maBullScore >= maBearScore;
  const maSignal: SignalDetail = {
    type: "MARKET_ALIGNMENT", name: "Market Alignment",
    score: maIsBullish ? maBullScore : maBearScore,
    active: maBullScore >= 65 || maBearScore >= 65,
    bullish: maIsBullish, value: maBullScore - maBearScore, description: maDesc,
  };
  (maIsBullish ? bullishSignals : bearishSignals).push(maSignal);

  // ── Compute Composite Scores ─────────────────────────────
  const allSignals = [...bullishSignals, ...bearishSignals];

  let bullishTotal = 0;
  let bearishTotal = 0;
  for (const signal of allSignals) {
    const weight = SIGNAL_WEIGHTS[signal.type] / 100;
    if (signal.bullish) bullishTotal += signal.score * weight;
    else bearishTotal += signal.score * weight;
  }

  // Confluence bonus
  const bullishActive = bullishSignals.filter((s) => s.active).length;
  const bearishActive = bearishSignals.filter((s) => s.active).length;
  if (bullishActive >= 3) bullishTotal = Math.min(bullishTotal + 10, 100);
  if (bearishActive >= 3) bearishTotal = Math.min(bearishTotal + 10, 100);

  const isBullish = bullishTotal >= bearishTotal;
  let totalScore = isBullish ? bullishTotal : bearishTotal;

  // ── Time-of-Day Weighting ────────────────────────────────
  const now = new Date();
  const etHourStr = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(now);
  const etMinStr = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", minute: "numeric" }).format(now);
  const etHour = parseInt(etHourStr, 10);
  const etMin = parseInt(etMinStr, 10);

  if ((etHour === 9 && etMin >= 30) || etHour === 10) {
    totalScore = Math.min(totalScore * 1.15, 100);
  } else if (etHour === 15) {
    totalScore = Math.min(totalScore * 1.10, 100);
  } else if (etHour >= 12 && etHour <= 14) {
    totalScore = totalScore * 0.90;
  }

  // ── Price Level Awareness ────────────────────────────────
  if (bars.length > 30 && priorDayBars.length > 5) {
    const levels = calculateKeyLevels(symbol, priorDayBars, todayBars, currentPrice);
    if (isBullish) {
      if (levels.currentVsLevels === "NEAR_SUPPORT") totalScore = Math.min(totalScore + 8, 100);
      else if (levels.currentVsLevels === "NEAR_RESISTANCE") totalScore = Math.max(totalScore - 8, 0);
      else if (levels.currentVsLevels === "ABOVE_ALL") totalScore = Math.max(totalScore - 12, 0);
    } else {
      if (levels.currentVsLevels === "NEAR_RESISTANCE") totalScore = Math.min(totalScore + 8, 100);
      else if (levels.currentVsLevels === "NEAR_SUPPORT") totalScore = Math.max(totalScore - 8, 0);
      else if (levels.currentVsLevels === "BELOW_ALL") totalScore = Math.max(totalScore - 12, 0);
    }
  }

  // ── Multi-Timeframe Confirmation ─────────────────────────
  if (bars.length > 50) {
    const hourlyBars = synthesizeHourlyBars(bars);
    if (hourlyBars.length >= 25) {
      const hourlyTrend = analyzeHourlyTrend(hourlyBars);
      if (isBullish && hourlyTrend.trend === "BULLISH") totalScore = Math.min(totalScore + 10, 100);
      else if (isBullish && hourlyTrend.trend === "BEARISH") totalScore = Math.max(totalScore - 15, 0);
      else if (!isBullish && hourlyTrend.trend === "BEARISH") totalScore = Math.min(totalScore + 10, 100);
      else if (!isBullish && hourlyTrend.trend === "BULLISH") totalScore = Math.max(totalScore - 15, 0);
    }
  }

  const finalScore = Math.round(totalScore);

  // ── Confidence Level ─────────────────────────────────────
  const activeInDirection = isBullish ? bullishActive : bearishActive;
  let confidence: CompositeSignal["confidence"] = "LOW";
  if (finalScore >= 85 && activeInDirection >= 4) confidence = "VERY_HIGH";
  else if (finalScore >= 70 && activeInDirection >= 3) confidence = "HIGH";
  else if (finalScore >= 50 && activeInDirection >= 2) confidence = "MEDIUM";

  // ── Direction ────────────────────────────────────────────
  let direction: CompositeSignal["direction"] = "NEUTRAL";
  if (finalScore >= 40) direction = isBullish ? "LONG" : "SHORT";

  // ── Plain English Explanation ────────────────────────────
  const dirWord = direction === "LONG" ? "long (call)" : direction === "SHORT" ? "short (put)" : "neutral";
  const activeSignalNames = allSignals.filter((s) => s.active).map((s) => s.name).join(", ");
  let explanation = `${symbol} scored ${finalScore} — `;

  if (direction === "NEUTRAL") {
    explanation += "no clear setup. Indicators are mixed or too weak to act on.";
  } else {
    explanation += `${confidence} confidence ${dirWord} setup. Active signals: ${activeSignalNames || "none"}. `;
    const strongest = allSignals
      .filter((s) => s.bullish === isBullish)
      .sort((a, b) => b.score - a.score)[0];
    if (strongest) {
      explanation += strongest.description.split(".")[0] + ".";
    }
  }

  return {
    symbol, score: finalScore, direction, confidence, explanation,
    signals: allSignals, timestamp: new Date().toISOString(), optionsPlayable: false,
  };
}

/**
 * Generate exit signals for an open position
 */
export function checkExitSignals(
  bars: Bar[],
  direction: "LONG" | "SHORT" = "LONG"
): { shouldExit: boolean; reason: string; urgency: "HIGH" | "MEDIUM" | "LOW" } {
  if (bars.length < 10) return { shouldExit: false, reason: "", urgency: "LOW" };

  const closes = bars.map((b) => b.close);
  const rsiValues = calcRSI(closes, 14);
  const ema9 = calcEMA(closes, 9);
  const vwaps = calcVWAP(bars);

  const currentPrice = closes[closes.length - 1];
  const currentRSI = rsiValues[rsiValues.length - 1] || 50;
  const currentEma9 = ema9[ema9.length - 1] || currentPrice;
  const currentVwap = vwaps[vwaps.length - 1] || currentPrice;

  if (direction === "LONG") {
    if (currentRSI > 75) {
      return { shouldExit: true, reason: `RSI overbought at ${currentRSI.toFixed(0)} — take profits on calls`, urgency: "MEDIUM" };
    }
    if (currentPrice < currentEma9 && closes.length > 2 && closes[closes.length - 2] >= ema9[ema9.length - 2]) {
      return { shouldExit: true, reason: "Price broke below 9 EMA — call momentum fading", urgency: "HIGH" };
    }
    if (currentPrice < currentVwap && closes.length > 2 && closes[closes.length - 2] > vwaps[vwaps.length - 2]) {
      return { shouldExit: true, reason: "Price lost VWAP — sellers taking control, exit calls", urgency: "HIGH" };
    }
  } else {
    if (currentRSI < 25) {
      return { shouldExit: true, reason: `RSI oversold at ${currentRSI.toFixed(0)} — take profits on puts`, urgency: "MEDIUM" };
    }
    if (currentPrice > currentEma9 && closes.length > 2 && closes[closes.length - 2] <= ema9[ema9.length - 2]) {
      return { shouldExit: true, reason: "Price broke above 9 EMA — put momentum fading", urgency: "HIGH" };
    }
    if (currentPrice > currentVwap && closes.length > 2 && closes[closes.length - 2] < vwaps[vwaps.length - 2]) {
      return { shouldExit: true, reason: "Price reclaimed VWAP — buyers stepping in, exit puts", urgency: "HIGH" };
    }
  }

  return { shouldExit: false, reason: "", urgency: "LOW" };
}

/**
 * Score the overall market conditions from a watchlist
 */
export function marketBreadth(
  allSignals: CompositeSignal[]
): { bullishPercent: number; bearishPercent: number; avgScore: number; tradeable: boolean } {
  if (allSignals.length === 0) return { bullishPercent: 0, bearishPercent: 0, avgScore: 0, tradeable: false };

  const bullish = allSignals.filter((s) => s.direction === "LONG").length;
  const bearish = allSignals.filter((s) => s.direction === "SHORT").length;
  const bullishPercent = (bullish / allSignals.length) * 100;
  const bearishPercent = (bearish / allSignals.length) * 100;
  const avgScore = allSignals.reduce((sum, s) => sum + s.score, 0) / allSignals.length;

  const tradeable = (bullishPercent >= 30 || bearishPercent >= 30) && avgScore >= 30;

  return { bullishPercent, bearishPercent, avgScore, tradeable };
}
