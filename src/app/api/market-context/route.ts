// ============================================================
// GET /api/market-context
// Fetches SPY + VIX quotes and returns market regime info
// ============================================================

import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/alpaca";
import { detectRegime } from "@/lib/regime";

export async function GET() {
  try {
    // Fetch SPY and VIX quotes
    const [spyQuote, vixQuote] = await Promise.all([
      getSnapshot("SPY"),
      getSnapshot("VIXY").catch(() => null),
    ]);

    const spyChange = spyQuote?.changePercent || 0;
    // Use VIXY as approximate VIX proxy, or default to 18 (normal)
    const vixLevel = vixQuote?.price || 18;

    const regime = detectRegime(vixLevel, spyChange);

    return NextResponse.json({
      spy: spyQuote,
      vixLevel,
      regime,
    });
  } catch (error: any) {
    console.error("Market context error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market context", details: error.message },
      { status: 500 }
    );
  }
}
