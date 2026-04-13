// ============================================================
// POST /api/backtest
// Fetches historical bars from Alpaca and runs backtest engine
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getBars } from "@/lib/alpaca";
import { runBacktest, optimizeParameter, gridSearch, BacktestConfig, DEFAULT_BACKTEST_CONFIG } from "@/lib/backtest";
import { Bar } from "@/lib/types";
import { getRecordingStats } from "@/lib/options-loader";

const DATA_URL = process.env.ALPACA_DATA_URL || "https://data.alpaca.markets";
const FEED = process.env.ALPACA_FEED || "iex";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY || "",
    "Content-Type": "application/json",
  };
}

/**
 * Fetch historical bars for a longer period (multi-day)
 */
async function getHistoricalBars(
  symbol: string,
  startDate: string,
  endDate: string,
  timeframe: string = "5Min"
): Promise<Bar[]> {
  const allBars: Bar[] = [];
  let pageToken: string | null = null;

  // Alpaca paginates, so we loop
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      timeframe,
      start: `${startDate}T09:30:00Z`,
      end: `${endDate}T16:00:00Z`,
      limit: "10000",
      adjustment: "raw",
      feed: FEED,
    });

    if (pageToken) params.set("page_token", pageToken);

    const res = await fetch(`${DATA_URL}/v2/stocks/${symbol}/bars?${params}`, {
      headers: headers(),
    });

    if (!res.ok) {
      console.error(`Historical bars error for ${symbol}: ${res.status}`);
      break;
    }

    const data = await res.json();
    const bars = (data.bars || []).map((b: any) => ({
      timestamp: b.t,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
      vwap: b.vw,
    }));

    allBars.push(...bars);

    if (data.next_page_token) {
      pageToken = data.next_page_token;
    } else {
      break;
    }
  }

  return allBars;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body.mode || "backtest"; // "backtest" or "optimize"

    const config: BacktestConfig = {
      ...DEFAULT_BACKTEST_CONFIG,
      ...body.config,
    };

    if (!config.symbols || config.symbols.length === 0) {
      return NextResponse.json({ error: "No symbols provided" }, { status: 400 });
    }

    if (!config.startDate || !config.endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    // Fetch historical bars for all symbols
    const allBars: Record<string, Bar[]> = {};

    // Process in batches of 3 to avoid rate limits
    for (let i = 0; i < config.symbols.length; i += 3) {
      const batch = config.symbols.slice(i, i + 3);
      const results = await Promise.all(
        batch.map((sym) =>
          getHistoricalBars(sym, config.startDate, config.endDate)
        )
      );

      for (let j = 0; j < batch.length; j++) {
        allBars[batch[j]] = results[j];
      }

      if (i + 3 < config.symbols.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const totalBars = Object.values(allBars).reduce((s, b) => s + b.length, 0);

    if (totalBars === 0) {
      return NextResponse.json({
        error: "No historical data found for the given date range",
      }, { status: 400 });
    }

    if (mode === "optimize") {
      // Parameter optimization
      const paramName = body.paramName || "signalThreshold";
      const paramValues = body.paramValues || [50, 55, 60, 65, 70, 75, 80, 85];

      const result = optimizeParameter(allBars, config, paramName as any, paramValues);

      return NextResponse.json({
        optimization: result,
        totalBars,
        symbolCount: Object.keys(allBars).length,
      });
    }

    if (mode === "grid") {
      // Multi-parameter grid search
      const paramGrid = body.paramGrid || {
        trailingStopPercent: [15, 20, 25, 30],
        hardStopPercent: [25, 30, 40],
        takeProfitPercent: [0, 50, 100],
        maxHoldBars: [48, 78, 0],
      };

      const result = gridSearch(allBars, config, paramGrid, 20);

      return NextResponse.json({
        grid: result,
        totalBars,
        symbolCount: Object.keys(allBars).length,
      });
    }

    // Standard backtest
    const result = runBacktest(allBars, config);

    return NextResponse.json({
      result,
      totalBars,
      symbolCount: Object.keys(allBars).length,
      barsPerSymbol: Object.fromEntries(
        Object.entries(allBars).map(([sym, bars]) => [sym, bars.length])
      ),
      recordingStats: getRecordingStats(),
    });
  } catch (error: any) {
    console.error("Backtest error:", error);
    return NextResponse.json(
      { error: "Backtest failed", details: error.message },
      { status: 500 }
    );
  }
}
