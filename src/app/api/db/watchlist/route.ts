import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

// GET — fetch active watchlist
export async function GET() {
  try {
    const db = getSupabaseServer();
    const { data, error } = await db
      .from("watchlist")
      .select("*")
      .eq("active", true)
      .order("quant_rank", { ascending: true, nullsFirst: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ watchlist: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — add ticker(s) to watchlist
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getSupabaseServer();

    // Support single or bulk add
    const items = Array.isArray(body) ? body : [body];
    const rows = items.map((item: any) => ({
      symbol: item.symbol.toUpperCase(),
      quant_rank: item.quantRank || item.quant_rank || null,
      quant_score: item.quantScore || item.quant_score || null,
      active: true,
    }));

    const { data, error } = await db
      .from("watchlist")
      .upsert(rows, { onConflict: "symbol,active" })
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ watchlist: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove ticker or clear all
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const db = getSupabaseServer();

    if (symbol) {
      // Soft delete single ticker
      const { error } = await db
        .from("watchlist")
        .update({ active: false })
        .eq("symbol", symbol.toUpperCase());
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      // Soft delete all — archives for historical tracking
      const { error } = await db
        .from("watchlist")
        .update({ active: false })
        .eq("active", true);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
