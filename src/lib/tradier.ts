// ============================================================
// QUANT EDGE — Tradier API Client (Phase 2)
// Handles options chain fetching, expirations, and Greeks
// ============================================================

import { OptionsContract } from "./types";

const BASE_URL = process.env.TRADIER_SANDBOX === "true"
  ? "https://sandbox.tradier.com/v1"
  : "https://api.tradier.com/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.TRADIER_API_KEY || ""}`,
    Accept: "application/json",
  };
}

/**
 * Fetch available expiration dates for a symbol's options
 */
export async function getExpirations(symbol: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/markets/options/expirations?symbol=${symbol}&includeAllRoots=true`,
      { headers: headers() }
    );

    if (!res.ok) {
      console.error(`Tradier expirations error for ${symbol}: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const expirations = data?.expirations?.date;

    if (!expirations) return [];
    return Array.isArray(expirations) ? expirations : [expirations];
  } catch (err) {
    console.error(`Tradier expirations fetch failed for ${symbol}:`, err);
    return [];
  }
}

/**
 * Fetch the full options chain for a symbol at a specific expiration
 */
export async function getOptionsChain(
  symbol: string,
  expiration: string,
  optionType?: "call" | "put"
): Promise<OptionsContract[]> {
  try {
    let url = `${BASE_URL}/markets/options/chains?symbol=${symbol}&expiration=${expiration}&greeks=true`;
    if (optionType) url += `&optionType=${optionType}`;

    const res = await fetch(url, { headers: headers() });

    if (!res.ok) {
      console.error(`Tradier chain error for ${symbol}: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const options = data?.options?.option;

    if (!options) return [];
    const optionsList = Array.isArray(options) ? options : [options];

    return optionsList.map((opt: any) => {
      const bid = opt.bid || 0;
      const ask = opt.ask || 0;
      const mid = (bid + ask) / 2;

      return {
        symbol: opt.symbol || "",
        underlying: opt.underlying || symbol,
        type: opt.option_type === "call" ? "CALL" : "PUT",
        strike: opt.strike || 0,
        expiry: opt.expiration_date || expiration,
        bid,
        ask,
        last: opt.last || 0,
        volume: opt.volume || 0,
        openInterest: opt.open_interest || 0,
        impliedVolatility: opt.greeks?.smv_vol || opt.greeks?.mid_iv || 0,
        delta: opt.greeks?.delta || 0,
        gamma: opt.greeks?.gamma || 0,
        theta: opt.greeks?.theta || 0,
        vega: opt.greeks?.vega || 0,
        spreadPercent: mid > 0 ? ((ask - bid) / mid) * 100 : 999,
      } as OptionsContract;
    });
  } catch (err) {
    console.error(`Tradier chain fetch failed for ${symbol}:`, err);
    return [];
  }
}

/**
 * Fetch chains for multiple expirations at once
 * Returns sorted by expiration date (nearest first)
 */
export async function getMultiExpirationChain(
  symbol: string,
  expirations: string[],
  optionType?: "call" | "put"
): Promise<OptionsContract[]> {
  const promises = expirations.map((exp) => getOptionsChain(symbol, exp, optionType));
  const results = await Promise.all(promises);
  return results.flat();
}

/**
 * Get the nearest N expiration dates (filtering for relevant DTEs)
 */
export async function getNearestExpirations(
  symbol: string,
  maxDTE: number = 7,
  maxCount: number = 4
): Promise<string[]> {
  const allExpirations = await getExpirations(symbol);
  if (allExpirations.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return allExpirations
    .filter((exp) => {
      const expDate = new Date(exp + "T00:00:00");
      const dte = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return dte >= 0 && dte <= maxDTE;
    })
    .slice(0, maxCount);
}

/**
 * Quick liquidity check — fetches just the nearest expiration
 * to determine if a symbol has tradeable options at all
 */
export async function quickLiquidityCheck(
  symbol: string
): Promise<{ hasOptions: boolean; avgOI: number; avgSpread: number; callCount: number }> {
  const expirations = await getNearestExpirations(symbol, 7, 1);
  if (expirations.length === 0) {
    return { hasOptions: false, avgOI: 0, avgSpread: 999, callCount: 0 };
  }

  const chain = await getOptionsChain(symbol, expirations[0], "call");
  if (chain.length === 0) {
    return { hasOptions: false, avgOI: 0, avgSpread: 999, callCount: 0 };
  }

  // Only consider ATM and near-ATM options (within 5 strikes of current price)
  // We'll use the chain's strike range to approximate
  const strikes = chain.map((c) => c.strike).sort((a, b) => a - b);
  const midStrike = strikes[Math.floor(strikes.length / 2)];
  const nearATM = chain.filter(
    (c) => Math.abs(c.strike - midStrike) / midStrike < 0.05
  );

  const relevant = nearATM.length > 0 ? nearATM : chain.slice(0, 10);

  const avgOI = relevant.reduce((sum, c) => sum + c.openInterest, 0) / relevant.length;
  const avgSpread = relevant.reduce((sum, c) => sum + c.spreadPercent, 0) / relevant.length;

  return {
    hasOptions: true,
    avgOI,
    avgSpread,
    callCount: chain.length,
  };
}
