// ============================================================
// GET /api/events
// Fetches earnings calendar + economic events from Finnhub (free)
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const BASE = "https://finnhub.io/api/v1";

interface CalendarEvent {
  type: string;
  symbol?: string;
  date: string;
  time?: string;
  description: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || new Date().toISOString().slice(0, 10);
  const to = searchParams.get("to") || from;
  const symbols = searchParams.get("symbols")?.split(",") || [];

  const events: CalendarEvent[] = [];

  try {
    // Fetch earnings calendar
    if (FINNHUB_KEY) {
      const earningsRes = await fetch(
        `${BASE}/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`
      );
      if (earningsRes.ok) {
        const data = await earningsRes.json();
        const earnings = data.earningsCalendar || [];
        for (const e of earnings) {
          // Only include earnings for watchlist tickers
          if (symbols.length > 0 && symbols.includes(e.symbol)) {
            events.push({
              type: "earnings",
              symbol: e.symbol,
              date: e.date,
              time: e.hour === "bmo" ? "before open" : e.hour === "amc" ? "after close" : e.hour,
              description: `${e.symbol} earnings${e.epsEstimate ? ` (est EPS $${e.epsEstimate})` : ""}`,
            });
          }
        }
      }

      // Fetch economic calendar (FOMC, CPI, etc.)
      const econRes = await fetch(
        `${BASE}/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_KEY}`
      );
      if (econRes.ok) {
        const data = await econRes.json();
        const econ = data.economicCalendar || [];
        // Filter for high-impact events
        const highImpact = ["FOMC", "CPI", "Non-Farm", "GDP", "PPI", "Retail Sales", "Unemployment"];
        for (const e of econ) {
          if (e.impact === "high" || highImpact.some((kw) => (e.event || "").includes(kw))) {
            events.push({
              type: "economic",
              date: e.date || from,
              time: e.time || undefined,
              description: e.event || "Economic event",
            });
          }
        }
      }
    }

    return NextResponse.json({ events, from, to });
  } catch (error: any) {
    console.error("Events API error:", error);
    return NextResponse.json({ events: [], error: error.message }, { status: 200 });
  }
}
