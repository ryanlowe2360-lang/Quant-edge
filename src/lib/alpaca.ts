// ============================================================
// QUANT EDGE — Alpaca API Client
// Handles market data fetching and paper trade execution
// ============================================================

import { Bar, Quote } from "./types";

const DATA_URL = process.env.ALPACA_DATA_URL || "https://data.alpaca.markets";
const FEED = process.env.ALPACA_FEED || "iex"; // "iex" (free) or "sip" (paid $9/mo)
const TRADE_URL = process.env.ALPACA_PAPER === "true"
  ? process.env.ALPACA_PAPER_URL || "https://paper-api.alpaca.markets"
  : process.env.ALPACA_LIVE_URL || "https://api.alpaca.markets";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY || "",
    "Content-Type": "application/json",
  };
}

/**
 * Fetch intraday bars (1-min or 5-min) for a symbol
 */
export async function getBars(
  symbol: string,
  timeframe: "1Min" | "5Min" = "5Min",
  limit: number = 100
): Promise<Bar[]> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(start.getHours() - 32); // Last 32 hours = covers prior trading day

  const params = new URLSearchParams({
    timeframe,
    start: start.toISOString(),
    limit: limit.toString(),
    adjustment: "raw",
    feed: FEED, // Free tier uses IEX
  });

  const res = await fetch(`${DATA_URL}/v2/stocks/${symbol}/bars?${params}`, {
    headers: headers(),
  });

  if (!res.ok) {
    console.error(`Alpaca bars error for ${symbol}: ${res.status}`);
    return [];
  }

  const data = await res.json();

  return (data.bars || []).map((b: any) => ({
    timestamp: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
    vwap: b.vw,
  }));
}

/**
 * Fetch latest quote/snapshot for a symbol
 */
export async function getSnapshot(symbol: string): Promise<Quote | null> {
  const res = await fetch(`${DATA_URL}/v2/stocks/${symbol}/snapshot?feed=${FEED}`, {
    headers: headers(),
  });

  if (!res.ok) {
    console.error(`Alpaca snapshot error for ${symbol}: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const quote = data.latestTrade || {};
  const prevBar = data.prevDailyBar || {};
  const dailyBar = data.dailyBar || {};

  const price = quote.p || dailyBar?.c || 0;
  const prevClose = prevBar.c || price;

  return {
    symbol,
    price,
    change: price - prevClose,
    changePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
    volume: dailyBar?.v || 0,
    high: dailyBar?.h || price,
    low: dailyBar?.l || price,
    open: dailyBar?.o || price,
    prevClose,
    timestamp: quote.t || new Date().toISOString(),
  };
}

/**
 * Fetch snapshots for multiple symbols at once
 */
export async function getMultipleSnapshots(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};

  const params = new URLSearchParams({
    symbols: symbols.join(","),
    feed: FEED,
  });

  const res = await fetch(`${DATA_URL}/v2/stocks/snapshots?${params}`, {
    headers: headers(),
  });

  if (!res.ok) {
    console.error(`Alpaca multi-snapshot error: ${res.status}`);
    return {};
  }

  const data = await res.json();
  const quotes: Record<string, Quote> = {};

  for (const [sym, snap] of Object.entries(data) as any) {
    const price = snap.latestTrade?.p || snap.dailyBar?.c || 0;
    const prevClose = snap.prevDailyBar?.c || price;

    quotes[sym] = {
      symbol: sym,
      price,
      change: price - prevClose,
      changePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      volume: snap.dailyBar?.v || 0,
      high: snap.dailyBar?.h || price,
      low: snap.dailyBar?.l || price,
      open: snap.dailyBar?.o || price,
      prevClose,
      timestamp: snap.latestTrade?.t || new Date().toISOString(),
    };
  }

  return quotes;
}

/**
 * Get account info (balance, buying power, etc.)
 */
export async function getAccount(): Promise<{
  cash: number;
  portfolioValue: number;
  buyingPower: number;
} | null> {
  const res = await fetch(`${TRADE_URL}/v2/account`, {
    headers: headers(),
  });

  if (!res.ok) return null;
  const data = await res.json();

  return {
    cash: parseFloat(data.cash),
    portfolioValue: parseFloat(data.portfolio_value),
    buyingPower: parseFloat(data.buying_power),
  };
}

/**
 * Submit a paper trade order
 */
export async function submitOrder(params: {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit";
  timeInForce: "day" | "gtc";
  limitPrice?: number;
}) {
  const body: any = {
    symbol: params.symbol,
    qty: params.qty.toString(),
    side: params.side,
    type: params.type,
    time_in_force: params.timeInForce,
  };

  if (params.limitPrice) {
    body.limit_price = params.limitPrice.toString();
  }

  const res = await fetch(`${TRADE_URL}/v2/orders`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Order error: ${JSON.stringify(err)}`);
  }

  return res.json();
}
