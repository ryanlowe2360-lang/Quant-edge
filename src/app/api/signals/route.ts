// ============================================================
// GET /api/signals?symbols=AAPL,MSFT,NVDA
// Runs the signal engine on each symbol and returns scored results
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getBars } from "@/lib/alpaca";
import { analyzeSymbol } from "@/lib/signals";
import { CompositeSignal } from "@/lib/types";

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ error: "symbols parameter required" }, { status: 400 });
  }

  const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase());

  try {
    // Fetch SPY bars first for relative strength
    const spyBars = await getBars("SPY", "5Min", 200);

    // Batch fetch bars in groups of 5 to avoid 429 rate limits
    const allBars: Record<string, any[]> = {};
    const BATCH_SIZE = 5;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((sym) => getBars(sym, "5Min", 200))
      );
      batch.forEach((sym, idx) => {
        allBars[sym] = batchResults[idx];
      });
      // Small delay between batches
      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Run signal engine on each
    const results: Record<string, CompositeSignal> = {};

    for (const sym of symbols) {
      const bars = allBars[sym];
      if (bars && bars.length > 0) {
        results[sym] = analyzeSymbol(sym, bars, spyBars.length > 0 ? spyBars : undefined);
      }
    }

    return NextResponse.json({
      signals: results,
      scannedAt: new Date().toISOString(),
      count: Object.keys(results).length,
    });
  } catch (error: any) {
    console.error("Signal scan error:", error);
    return NextResponse.json(
      { error: "Failed to scan signals", details: error.message },
      { status: 500 }
    );
  }
}
