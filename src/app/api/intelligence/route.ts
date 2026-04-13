// ============================================================
// GET /api/intelligence?symbols=AAPL,MSFT
// Returns market regime (VIX), multi-timeframe bias, key levels
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getMultipleSnapshots, getBars } from "@/lib/alpaca";
import { detectRegime } from "@/lib/regime";
import { getTimeframeBias, TimeframeBias } from "@/lib/multiframe";
import { calculateKeyLevels, KeyLevels } from "@/lib/regime";

const DATA_URL = process.env.ALPACA_DATA_URL || "https://data.alpaca.markets";
const FEED = process.env.ALPACA_FEED || "iex";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY || "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY || "",
  };
}

async function getDailyBars(symbol: string, limit: number = 30) {
  const params = new URLSearchParams({
    timeframe: "1Day",
    limit: limit.toString(),
    adjustment: "raw",
    feed: FEED,
  });

  const res = await fetch(`${DATA_URL}/v2/stocks/${symbol}/bars?${params}`, {
    headers: headers(),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.bars || []).map((b: any) => ({
    timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v, vwap: b.vw,
  }));
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");

  try {
    // 1. Market regime — get VIX from Tradier (accurate) and SPY from Alpaca
    let vixLevel = 18; // default fallback

    // Fetch real VIX from Tradier
    const tradierKey = process.env.TRADIER_API_KEY;
    const tradierBase = process.env.TRADIER_SANDBOX === "true"
      ? "https://sandbox.tradier.com/v1"
      : "https://api.tradier.com/v1";

    if (tradierKey) {
      try {
        const vixRes = await fetch(`${tradierBase}/markets/quotes?symbols=VIX&greeks=false`, {
          headers: {
            Authorization: `Bearer ${tradierKey}`,
            Accept: "application/json",
          },
        });
        if (vixRes.ok) {
          const vixData = await vixRes.json();
          const vixQuote = vixData?.quotes?.quote;
          if (vixQuote) {
            vixLevel = vixQuote.last || vixQuote.close || 18;
          }
        }
      } catch (err) {
        console.error("Tradier VIX fetch error:", err);
      }
    }

    // Get SPY from Alpaca
    const regimeSnapshots = await getMultipleSnapshots(["SPY"]);
    const spyQuote = regimeSnapshots["SPY"];
    const spyChange = spyQuote?.changePercent || 0;

    const regime = detectRegime(vixLevel, spyChange);

    if (!symbolsParam) {
      return NextResponse.json({ regime, spy: spyQuote });
    }

    // 2. Multi-timeframe + key levels for each symbol
    const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase()).slice(0, 10);

    const mtfData: Record<string, TimeframeBias> = {};
    const levelsData: Record<string, KeyLevels> = {};

    // Process symbols (limit to 10 to avoid rate limits)
    for (let i = 0; i < symbols.length; i += 3) {
      const batch = symbols.slice(i, i + 3);

      const results = await Promise.all(
        batch.map(async (sym) => {
          const [dailyBars, intradayBars] = await Promise.all([
            getDailyBars(sym, 30),
            getBars(sym, "5Min", 100),
          ]);

          // MTF bias
          const bias = getTimeframeBias(sym, dailyBars, intradayBars);

          // Key levels (use last daily bar as "prior day")
          const priorDayBars = dailyBars.length > 1 ? [dailyBars[dailyBars.length - 2]] : [];
          const currentPrice = intradayBars.length > 0
            ? intradayBars[intradayBars.length - 1].close
            : dailyBars.length > 0
              ? dailyBars[dailyBars.length - 1].close
              : 0;

          const levels = calculateKeyLevels(sym, priorDayBars, intradayBars, currentPrice);

          return { sym, bias, levels };
        })
      );

      for (const { sym, bias, levels } of results) {
        mtfData[sym] = bias;
        levelsData[sym] = levels;
      }

      if (i + 3 < symbols.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return NextResponse.json({
      regime,
      spy: spyQuote,
      mtf: mtfData,
      levels: levelsData,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Intelligence API error:", error);
    return NextResponse.json(
      { error: "Intelligence fetch failed", details: error.message },
      { status: 500 }
    );
  }
}
