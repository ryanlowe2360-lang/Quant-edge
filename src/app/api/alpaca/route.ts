// ============================================================
// GET /api/alpaca?symbols=AAPL,MSFT
// Fetches current quotes/snapshots from Alpaca
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getMultipleSnapshots, getAccount } from "@/lib/alpaca";

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  const type = req.nextUrl.searchParams.get("type") || "quotes";

  try {
    if (type === "account") {
      const account = await getAccount();
      return NextResponse.json({ account });
    }

    if (!symbolsParam) {
      return NextResponse.json({ error: "symbols parameter required" }, { status: 400 });
    }

    const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase());
    const quotes = await getMultipleSnapshots(symbols);

    return NextResponse.json({
      quotes,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Alpaca API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market data", details: error.message },
      { status: 500 }
    );
  }
}
