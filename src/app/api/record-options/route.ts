// ============================================================
// POST /api/record-options
// Snapshots options data from Tradier and saves to Supabase
// Records summary: top 5 ATM contracts per symbol per expiry
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getExpirations, getOptionsChain } from "@/lib/tradier";
import { getSupabaseServer } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = body.symbols || [];
    const stockPrices: Record<string, number> = body.prices || {};

    if (symbols.length === 0) {
      return NextResponse.json({ error: "No symbols provided" }, { status: 400 });
    }

    const db = getSupabaseServer();
    let recorded = 0;

    for (const sym of symbols.slice(0, 10)) {
      try {
        const expirations = await getExpirations(sym);
        if (expirations.length === 0) continue;

        const nearExpiries = expirations.slice(0, 3);
        const stockPrice = stockPrices[sym] || 0;

        for (const expiry of nearExpiries) {
          const chain = await getOptionsChain(sym, expiry);
          if (!chain || chain.length === 0) continue;

          const now = new Date();
          const expiryDate = new Date(expiry + "T16:00:00");
          const dte = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000));

          // Only save ATM ± 5 strikes to keep data small
          const atmStrike = chain.reduce((best: any, c: any) =>
            Math.abs(c.strike - stockPrice) < Math.abs(best.strike - stockPrice) ? c : best
          );
          const nearATM = chain.filter((c: any) =>
            Math.abs(c.strike - atmStrike.strike) <= (stockPrice * 0.05)
          );

          const snapshot = {
            symbol: sym,
            stock_price: stockPrice,
            expiry,
            dte,
            snapshot_json: nearATM.map((c: any) => ({
              type: c.type,
              strike: c.strike,
              bid: c.bid, ask: c.ask, last: c.last,
              volume: c.volume, oi: c.openInterest,
              delta: c.delta, gamma: c.gamma, theta: c.theta, vega: c.vega,
              iv: c.impliedVolatility,
            })),
            recorded_at: now.toISOString(),
          };

          await db.from("options_snapshots").insert(snapshot);
          recorded++;
        }

        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`Options recording error for ${sym}:`, err);
      }
    }

    return NextResponse.json({
      recorded,
      symbols: symbols.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Options recording error:", error);
    return NextResponse.json(
      { error: "Recording failed", details: error.message },
      { status: 500 }
    );
  }
}

// GET — return recording stats and recent snapshots
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const limit = parseInt(searchParams.get("limit") || "50");
    const db = getSupabaseServer();

    let query = db.from("options_snapshots")
      .select("symbol, stock_price, expiry, dte, snapshot_json, recorded_at")
      .order("recorded_at", { ascending: false })
      .limit(limit);

    if (symbol) query = query.eq("symbol", symbol.toUpperCase());

    const { data, error } = await query;
    if (error) {
      // Table might not exist yet — return empty gracefully
      if (error.message.includes("does not exist")) {
        return NextResponse.json({ snapshots: [], totalRecords: 0, needsMigration: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by date for stats
    const dates = new Set((data || []).map((d: any) => d.recorded_at?.slice(0, 10)));

    return NextResponse.json({
      snapshots: data || [],
      totalRecords: (data || []).length,
      daysRecorded: dates.size,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
