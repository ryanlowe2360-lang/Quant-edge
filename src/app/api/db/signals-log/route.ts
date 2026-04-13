import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

// GET — fetch signal history
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const limit = parseInt(searchParams.get("limit") || "100");
    const db = getSupabaseServer();

    let query = db.from("signals").select("*").order("created_at", { ascending: false }).limit(limit);
    if (symbol) query = query.eq("symbol", symbol.toUpperCase());

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ signals: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — log signal(s) to DB
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getSupabaseServer();
    const items = Array.isArray(body) ? body : [body];

    const rows = items.map((s: any) => ({
      symbol: s.symbol,
      score: s.score,
      direction: s.direction,
      confidence: s.confidence || null,
      indicators_json: s.signals || s.indicators_json || null,
      explanation: s.explanation || null,
      contract_recommendation: s.contractRecommendation || s.contract_recommendation || null,
    }));

    const { data, error } = await db.from("signals").insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ signals: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
