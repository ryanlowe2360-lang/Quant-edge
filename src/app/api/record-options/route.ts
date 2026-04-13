// ============================================================
// POST /api/record-options
// Snapshots real-time options data from Tradier and saves to Supabase
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

    let recorded = 0;
    const db = getSupabaseServer();

    for (const sym of symbols.slice(0, 10)) {
      try {
        const expirations = await getExpirations(sym);
        if (expirations.length === 0) continue;

        const nearExpiries = expirations.slice(0, 3);

        for (const expiry of nearExpiries) {
          const chain = await getOptionsChain(sym, expiry);
          if (!chain || chain.length === 0) continue;

          const now = new Date();
          const expiryDate = new Date(expiry + "T16:00:00");
          const dte = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000));

          const snapshot = {
            timestamp: now.toISOString(),
            symbol: sym,
            stockPrice: stockPrices[sym] || 0,
            contracts: chain.map((c: any) => ({
              symbol: c.symbol || "",
              type: c.type === "put" ? "PUT" : "CALL",
              strike: c.strike || 0,
              expiry,
              bid: c.bid || 0,
              ask: c.ask || 0,
              last: c.last || 0,
              volume: c.volume || 0,
              openInterest: c.openInterest || c.open_interest || 0,
              delta: c.delta || c.greeks?.delta || 0,
              gamma: c.gamma || c.greeks?.gamma || 0,
              theta: c.theta || c.greeks?.theta || 0,
              vega: c.vega || c.greeks?.vega || 0,
              impliedVolatility: c.impliedVolatility || c.greeks?.mid_iv || 0,
              dte,
            })),
          };

          await db.from("options_snapshots").insert({
            symbol: sym,
            snapshot_json: snapshot,
          });

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

export async function GET() {
  try {
    const db = getSupabaseServer();

    const { data, error } = await db
      .from("options_snapshots")
      .select("symbol, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const days = new Set((data || []).map((r: any) => r.created_at.slice(0, 10)));

    return NextResponse.json({
      totalRecords: data?.length || 0,
      daysRecorded: days.size,
      recentSymbols: [...new Set((data || []).map((r: any) => r.symbol))],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
