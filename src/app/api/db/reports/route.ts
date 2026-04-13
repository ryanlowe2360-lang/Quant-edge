import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

// GET — fetch reports
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "daily"; // "daily" | "weekly"
    const limit = parseInt(searchParams.get("limit") || "30");
    const date = searchParams.get("date"); // specific date
    const db = getSupabaseServer();

    if (type === "weekly") {
      const { data, error } = await db
        .from("weekly_reports")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(limit);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ reports: data });
    }

    // Daily
    let query = db.from("daily_reports").select("*").order("date", { ascending: false }).limit(limit);
    if (date) query = query.eq("date", date);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reports: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — save a report
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, ...report } = body;
    const table = type === "weekly" ? "weekly_reports" : "daily_reports";
    const db = getSupabaseServer();

    const { data, error } = await db.from(table).upsert(report).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ report: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
