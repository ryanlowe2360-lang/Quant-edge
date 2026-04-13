// ============================================================
// POST /api/generate-report
// Generate and optionally send morning/EOD/weekly reports
// Can be called by Vercel cron or manually from the UI
// Body: { type: "morning" | "eod" | "weekly", sendTelegram?: boolean }
// ============================================================

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { type, sendTelegram: shouldSend } = await req.json();

    // Note: When Supabase is connected, this route will:
    // 1. Fetch trade data from Supabase
    // 2. Generate the report
    // 3. Store it in daily_reports/weekly_reports table
    // 4. Send via Telegram if requested
    //
    // For now, reports are generated client-side in ReportsView
    // and sent to Telegram from there.

    return NextResponse.json({
      success: true,
      message: `Report generation for '${type}' — use the Reports tab in the app. Server-side generation requires Supabase setup.`,
      type,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
