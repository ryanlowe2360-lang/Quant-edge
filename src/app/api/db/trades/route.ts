import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

// GET — fetch trades (user, system, or both)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "both"; // "user" | "system" | "both"
    const limit = parseInt(searchParams.get("limit") || "50");
    const date = searchParams.get("date"); // YYYY-MM-DD filter
    const db = getSupabaseServer();

    const results: any = {};

    if (type === "user" || type === "both") {
      let query = db.from("trades_user").select("*").order("entry_time", { ascending: false }).limit(limit);
      if (date) {
        query = query.gte("entry_time", `${date}T00:00:00`).lte("entry_time", `${date}T23:59:59`);
      }
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      results.userTrades = data;
    }

    if (type === "system" || type === "both") {
      let query = db.from("trades_system").select("*").order("entry_time", { ascending: false }).limit(limit);
      if (date) {
        query = query.gte("entry_time", `${date}T00:00:00`).lte("entry_time", `${date}T23:59:59`);
      }
      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      results.systemTrades = data;
    }

    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — log a new trade
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...trade } = body; // type = "user" | "system"
    const table = type === "system" ? "trades_system" : "trades_user";
    const db = getSupabaseServer();

    const { data, error } = await db.from(table).insert(trade).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ trade: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT — update a trade (close it, add grade, etc.)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, type, ...updates } = body;
    const table = type === "system" ? "trades_system" : "trades_user";
    const db = getSupabaseServer();

    const { data, error } = await db.from(table).update(updates).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ trade: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
