// ============================================================
// GET /api/db/watchlist-history
// Fetches archived (soft-deleted) watchlist entries grouped by week
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "200");
    const db = getSupabaseServer();

    // Fetch all watchlist entries (active and archived), ordered by date
    const { data, error } = await db
      .from("watchlist")
      .select("symbol, quant_rank, quant_score, date_added, active, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Group by week
    const weeks: Record<string, {
      weekStart: string;
      weekEnd: string;
      tickers: Array<{ symbol: string; quantRank: number | null; quantScore: number | null; active: boolean }>;
    }> = {};

    for (const item of (data || [])) {
      const date = new Date(item.created_at || item.date_added);
      const dayOfWeek = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((dayOfWeek + 6) % 7)); // Monday
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const weekKey = monday.toISOString().slice(0, 10);
      if (!weeks[weekKey]) {
        weeks[weekKey] = {
          weekStart: weekKey,
          weekEnd: sunday.toISOString().slice(0, 10),
          tickers: [],
        };
      }

      // Avoid duplicates within same week
      const exists = weeks[weekKey].tickers.find((t) => t.symbol === item.symbol);
      if (!exists) {
        weeks[weekKey].tickers.push({
          symbol: item.symbol,
          quantRank: item.quant_rank,
          quantScore: item.quant_score,
          active: item.active,
        });
      }
    }

    // Sort tickers within each week by rank
    for (const week of Object.values(weeks)) {
      week.tickers.sort((a, b) => (a.quantRank || 99) - (b.quantRank || 99));
    }

    // Convert to sorted array
    const history = Object.values(weeks).sort(
      (a, b) => b.weekStart.localeCompare(a.weekStart)
    );

    return NextResponse.json({ history, totalWeeks: history.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
