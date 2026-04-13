// ============================================================
// QUANT EDGE — Smart Options Contract Engine (Phase 5)
// Trade-type-aware contract selection with educational output
// ============================================================

import {
  OptionsContract,
  OptionsRecommendation,
  OptionsChainSummary,
  OptionsSettings,
  LiquidityGrade,
  TradeType,
  CompositeSignal,
} from "./types";

export const DEFAULT_OPTIONS_SETTINGS: OptionsSettings = {
  maxBudgetPerTrade: 400,
  preferredDTE: [0, 1, 2, 5],
  minOpenInterest: 100,
  maxSpreadPercent: 15,       // tightened from 30% per master plan
  minDelta: 0.30,
  maxDelta: 0.55,
  preferCalls: true,
};

// ── Trade Type Detection ────────────────────────────────────

export function detectTradeType(signal?: CompositeSignal): TradeType {
  if (!signal) return "MOMENTUM";
  const score = signal.score;
  const activeCount = signal.signals.filter((s) => s.active).length;

  // Very high score + many active signals = strong momentum, ride it
  if (score >= 85 && activeCount >= 4) return "MOMENTUM";
  // High score but fewer signals = day trade
  if (score >= 70 && activeCount >= 2) return "DAY_TRADE";
  // Moderate score = quick scalp
  return "SCALP";
}

function getTargetDTE(tradeType: TradeType): { min: number; max: number; ideal: number } {
  switch (tradeType) {
    case "SCALP":     return { min: 0, max: 1, ideal: 0 };
    case "MOMENTUM":  return { min: 2, max: 5, ideal: 3 };
    case "DAY_TRADE":  return { min: 1, max: 3, ideal: 2 };
  }
}

function getTargetDelta(tradeType: TradeType, confidence: string): { min: number; max: number; ideal: number } {
  // Higher confidence = can go slightly more OTM for leverage
  // Lower confidence = stay closer to ATM for probability
  if (confidence === "VERY_HIGH") return { min: 0.35, max: 0.50, ideal: 0.40 };
  if (confidence === "HIGH")      return { min: 0.38, max: 0.55, ideal: 0.45 };
  if (confidence === "MEDIUM")    return { min: 0.40, max: 0.55, ideal: 0.48 };
  return { min: 0.42, max: 0.55, ideal: 0.50 }; // LOW — stay near ATM
}

// ── Liquidity Grading ───────────────────────────────────────

export function gradeLiquidity(
  contracts: OptionsContract[],
  settings: OptionsSettings = DEFAULT_OPTIONS_SETTINGS
): LiquidityGrade {
  if (contracts.length === 0) return "NONE";
  const qualifying = contracts.filter(
    (c) => c.openInterest >= settings.minOpenInterest && c.spreadPercent <= settings.maxSpreadPercent
  );
  const ratio = qualifying.length / contracts.length;
  if (ratio >= 0.4 && qualifying.length >= 5) return "HIGH";
  if (ratio >= 0.2 && qualifying.length >= 3) return "MEDIUM";
  if (qualifying.length >= 1) return "LOW";
  return "NONE";
}

export function summarizeChain(
  symbol: string, contracts: OptionsContract[], expirations: string[]
): OptionsChainSummary {
  const calls = contracts.filter((c) => c.type === "CALL");
  const puts = contracts.filter((c) => c.type === "PUT");
  const avgSpread = contracts.length > 0
    ? contracts.reduce((sum, c) => sum + c.spreadPercent, 0) / contracts.length : 999;
  const avgOI = contracts.length > 0
    ? contracts.reduce((sum, c) => sum + c.openInterest, 0) / contracts.length : 0;

  return {
    symbol, expirations, callCount: calls.length, putCount: puts.length,
    avgSpreadPercent: Math.round(avgSpread * 10) / 10,
    avgOpenInterest: Math.round(avgOI),
    liquidityGrade: gradeLiquidity(contracts),
    timestamp: new Date().toISOString(),
  };
}

// ── Contract Filtering ──────────────────────────────────────

export function filterContracts(
  contracts: OptionsContract[],
  currentPrice: number,
  direction: "LONG" | "SHORT",
  settings: OptionsSettings = DEFAULT_OPTIONS_SETTINGS
): OptionsContract[] {
  const maxAskPerShare = settings.maxBudgetPerTrade / 100;
  const wantCalls = direction === "LONG";

  return contracts.filter((c) => {
    if (wantCalls && c.type !== "CALL") return false;
    if (!wantCalls && c.type !== "PUT") return false;
    if (c.ask > maxAskPerShare && c.ask > 0) return false;
    if (c.openInterest < settings.minOpenInterest) return false;
    if (c.spreadPercent > settings.maxSpreadPercent) return false;
    const absDelta = Math.abs(c.delta);
    if (absDelta < settings.minDelta || absDelta > settings.maxDelta) return false;
    if (c.bid <= 0) return false;
    return true;
  });
}

// ── Contract Scoring ────────────────────────────────────────

function scoreContract(
  contract: OptionsContract,
  tradeType: TradeType,
  targetDelta: { min: number; max: number; ideal: number },
  accountBalance: number
): number {
  let score = 0;
  const absDelta = Math.abs(contract.delta);

  // Delta — closer to ideal = better
  const deltaDistance = Math.abs(absDelta - targetDelta.ideal);
  if (deltaDistance < 0.05) score += 35;
  else if (deltaDistance < 0.10) score += 25;
  else if (deltaDistance < 0.15) score += 15;
  else score += 5;

  // Spread — tighter is critical for short-term trades
  if (contract.spreadPercent < 5) score += 25;
  else if (contract.spreadPercent < 10) score += 18;
  else if (contract.spreadPercent < 15) score += 10;
  else score += 3;

  // Open Interest
  if (contract.openInterest >= 1000) score += 15;
  else if (contract.openInterest >= 500) score += 12;
  else if (contract.openInterest >= 100) score += 8;

  // Volume — active today means easy fills
  if (contract.volume >= 500) score += 15;
  else if (contract.volume >= 100) score += 10;
  else if (contract.volume >= 10) score += 5;

  // Cost efficiency — balance leverage vs account safety
  const cost = contract.ask * 100;
  const accountPct = (cost / accountBalance) * 100;
  if (accountPct <= 20) score += 10;      // sweet spot
  else if (accountPct <= 30) score += 6;
  else if (accountPct <= 50) score += 2;
  // Over 50% = risky but not disqualifying

  // Theta penalty for scalps — avoid high theta on 0DTE
  if (tradeType === "SCALP" && Math.abs(contract.theta) > 0.10) {
    score -= 5;
  }

  return score;
}

// ── DTE Calculation ─────────────────────────────────────────

function calcDTE(expiry: string): number {
  const exp = new Date(expiry + "T16:00:00");
  const now = new Date();
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

// ── Main Recommendation Engine ──────────────────────────────

export function recommendContract(
  symbol: string,
  contracts: OptionsContract[],
  currentPrice: number,
  accountBalance: number = 500,
  signal?: CompositeSignal,
  settings: OptionsSettings = DEFAULT_OPTIONS_SETTINGS
): OptionsRecommendation {
  const direction = signal?.direction === "SHORT" ? "SHORT" : "LONG";
  const confidence = signal?.confidence || "LOW";
  const tradeType = detectTradeType(signal);
  const targetDTE = getTargetDTE(tradeType);
  const targetDelta = getTargetDelta(tradeType, confidence);

  // Empty result template
  const emptyResult: OptionsRecommendation = {
    symbol, liquidityGrade: gradeLiquidity(contracts, settings),
    bestContract: null, alternatives: [], reason: "", estimatedCost: 0,
    spreadCost: 0, maxRisk: 0, timestamp: new Date().toISOString(),
    tradeType, whyThisStrike: "", whyThisExpiry: "",
    targetExit: 0, targetPnl: 0, targetPnlPct: 0,
    stopLoss: 0, stopLossPnl: 0, stopLossPnlPct: 0,
    positionSize: { recommended: 0, maxAffordable: 0, dollarRisk: 0, accountRiskPct: 0 },
    greeksSnapshot: null, riskWarning: "No qualifying contracts found.",
  };

  // Filter by direction
  const qualifying = filterContracts(contracts, currentPrice, direction, settings);

  if (qualifying.length === 0) {
    const hasAny = contracts.length > 0;
    const hasAffordable = contracts.some((c) => c.ask * 100 <= settings.maxBudgetPerTrade && c.ask > 0);
    const hasLiquid = contracts.some((c) => c.openInterest >= settings.minOpenInterest);

    let reason = "No options available for this symbol.";
    if (hasAny && !hasAffordable) reason = `All contracts exceed budget ($${settings.maxBudgetPerTrade}). Wait for a pullback to lower premiums.`;
    else if (hasAny && !hasLiquid) reason = `Open interest below minimum (${settings.minOpenInterest}). Spreads too wide.`;
    else if (hasAny) reason = "No contracts meet all criteria. Try relaxing filters in Settings.";

    return { ...emptyResult, reason };
  }

  // Filter by DTE preference
  let dteFiltered = qualifying.filter((c) => {
    const dte = calcDTE(c.expiry);
    return dte >= targetDTE.min && dte <= targetDTE.max;
  });
  // Fallback: if no contracts in target DTE range, use all qualifying
  if (dteFiltered.length === 0) dteFiltered = qualifying;

  // Score and rank
  const scored = dteFiltered
    .map((c) => ({ contract: c, score: scoreContract(c, tradeType, targetDelta, accountBalance) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0].contract;
  const alternatives = scored.slice(1, 4).map((s) => s.contract);
  const absDelta = Math.abs(best.delta);
  const dte = calcDTE(best.expiry);

  // Costs
  const estimatedCost = best.ask * 100;
  const spreadCost = (best.ask - best.bid) * 100;

  // Position sizing (5.5)
  const maxRiskPct = 0.30; // 30% max risk per trade
  const maxBudget = accountBalance * maxRiskPct;
  const maxAffordable = Math.floor(maxBudget / estimatedCost);
  const recommended = Math.max(1, Math.min(maxAffordable, 3)); // cap at 3 for small accounts
  const dollarRisk = recommended * estimatedCost;
  const accountRiskPct = (dollarRisk / accountBalance) * 100;

  // Greeks snapshot (5.6)
  const thetaPerHour = Math.abs(best.theta) / 6.5; // trading hours per day
  const greeksSnapshot = {
    delta: best.delta, gamma: best.gamma, theta: best.theta,
    vega: best.vega, iv: best.impliedVolatility, thetaPerHour,
  };

  // Target exit (5.7) — based on delta × expected move
  // Estimate expected move: ATR-based or simple 1-2% stock move
  const expectedStockMove = currentPrice * 0.015; // 1.5% move estimate
  const expectedOptionMove = expectedStockMove * absDelta;
  const targetExit = best.ask + expectedOptionMove;
  const targetPnl = (targetExit - best.ask) * 100 * recommended;
  const targetPnlPct = ((targetExit - best.ask) / best.ask) * 100;

  // Stop loss (5.8) — 30% of premium
  const stopLoss = best.ask * 0.70;
  const stopLossPnl = (stopLoss - best.ask) * 100 * recommended;
  const stopLossPnlPct = -30;

  // Educational explanations (5.9, 5.10)
  const typeLabel = direction === "LONG" ? "CALL" : "PUT";
  const tradeLabel = tradeType === "SCALP" ? "quick scalp (minutes)" : tradeType === "MOMENTUM" ? "momentum ride (hours)" : "day trade";

  const whyThisStrike = `$${best.strike} strike selected for delta ${absDelta.toFixed(2)} — this means for every $1 the stock moves ${direction === "LONG" ? "up" : "down"}, your ${typeLabel} moves ~$${absDelta.toFixed(2)}. ` +
    (absDelta >= 0.45 ? "Higher delta = more expensive but higher probability of profit. Good for high-conviction setups." :
     absDelta >= 0.35 ? "This delta balances leverage and probability — the sweet spot for directional bets." :
     "Slightly lower delta provides more leverage but lower probability. Best for strong momentum setups.");

  const whyThisExpiry = `${dte} DTE (expires ${best.expiry}) chosen for a ${tradeLabel}. ` +
    (dte === 0 ? "0DTE gives maximum gamma (explosive moves) but theta burns fast — exit quickly." :
     dte <= 2 ? `${dte} day${dte > 1 ? "s" : ""} gives room for the move while limiting theta decay to ~$${(Math.abs(best.theta) * dte).toFixed(2)} total.` :
     `${dte} days gives momentum trades time to develop. Theta costs ~$${(Math.abs(best.theta)).toFixed(2)}/day — manageable if the move plays out.`);

  // Risk warning (5.11)
  const riskWarning = `Max loss $${dollarRisk.toFixed(0)} (${accountRiskPct.toFixed(0)}% of account) with ${recommended} contract${recommended > 1 ? "s" : ""}. ` +
    (accountRiskPct > 40 ? "⚠️ HIGH RISK — consider reducing to 1 contract." :
     accountRiskPct > 25 ? "Moderate risk — acceptable for high-conviction signals." :
     "Within safe risk limits.");

  // Main reason
  const reason = `${typeLabel} $${best.strike} ${best.expiry} @ $${best.ask.toFixed(2)} — ` +
    `Delta ${absDelta.toFixed(2)}, ${dte} DTE, spread ${best.spreadPercent.toFixed(1)}%, OI ${best.openInterest}. ` +
    `Target: $${targetExit.toFixed(2)} (+${targetPnlPct.toFixed(0)}%) | Stop: $${stopLoss.toFixed(2)} (-30%). ` +
    `Theta: -$${thetaPerHour.toFixed(3)}/hour.`;

  return {
    symbol,
    liquidityGrade: gradeLiquidity(contracts, settings),
    bestContract: best, alternatives, reason,
    estimatedCost, spreadCost, maxRisk: dollarRisk,
    timestamp: new Date().toISOString(),
    tradeType, whyThisStrike, whyThisExpiry,
    targetExit, targetPnl, targetPnlPct,
    stopLoss, stopLossPnl, stopLossPnlPct,
    positionSize: { recommended, maxAffordable, dollarRisk, accountRiskPct },
    greeksSnapshot, riskWarning,
  };
}

export function batchRecommend(
  symbolData: Array<{ symbol: string; contracts: OptionsContract[]; currentPrice: number; signal?: CompositeSignal }>,
  accountBalance: number = 500,
  settings: OptionsSettings = DEFAULT_OPTIONS_SETTINGS
): Record<string, OptionsRecommendation> {
  const results: Record<string, OptionsRecommendation> = {};
  for (const { symbol, contracts, currentPrice, signal } of symbolData) {
    results[symbol] = recommendContract(symbol, contracts, currentPrice, accountBalance, signal, settings);
  }
  return results;
}
