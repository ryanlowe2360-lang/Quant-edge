// ============================================================
// GET /api/market-context
// Fetches SPY from Alpaca + real VIX from Tradier, returns regime
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
    const spyQuote = await getSnapshot("SPY");
    const spyChange = spyQuote?.changePercent || 0;

    // Fetch real VIX index from Tradier (not VIXY ETF proxy)
    let vixLevel = 18; // default fallback
    const tradierKey = process.env.TRADIER_API_KEY;

    if (tradierKey) {
      try {
        const vixRes = await fetch(
          `${TRADIER_BASE}/markets/quotes?symbols=VIX&greeks=false`,
          {
            headers: {
              Authorization: `Bearer ${tradierKey}`,
              Accept: "application/json",
            },
          }
        );
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
