// ============================================================
// GET /api/market-context
// Fetches SPY + real VIX from Tradier and returns market regime
// ============================================================

import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/alpaca";
import { detectRegime } from "@/lib/regime";

const TRADIER_BASE = process.env.TRADIER_SANDBOX === "true"
  ? "https://sandbox.tradier.com/v1"
  : "https://api.tradier.com/v1";

export async function GET() {
  try {
    // Fetch SPY from Alpaca
    const spyQuote = await getSnapshot("SPY").catch(() => null);
    const spyChange = spyQuote?.changePercent || 0;

    // Fetch real VIX from Tradier (VIX is an index, not available on Alpaca)
    let vixLevel = 18; // default fallback
    const tradierKey = process.env.TRADIER_API_KEY;
    if (tradierKey) {
      try {
        const res = await fetch(
          `${TRADIER_BASE}/markets/quotes?symbols=VIX&greeks=false`,
          {
            headers: {
              Authorization: `Bearer ${tradierKey}`,
              Accept: "application/json",
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          const quote = data?.quotes?.quote;
          if (quote) {
            vixLevel = quote.last || quote.close || 18;
          }
        }
      } catch (err) {
        console.error("Tradier VIX fetch error:", err);
      }
    }

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
