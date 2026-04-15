// ============================================================
// POST /api/generate-report
// Server-side report generation — called by Vercel cron
// Also supports GET for Vercel cron (crons hit GET by default)
// Body: { type: "morning" | "eod" | "weekly", sendTelegram?: boolean }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

const TRADIER_BASE = process.env.TRADIER_SANDBOX === "true"
  ? "https://sandbox.tradier.com/v1"
  : "https://api.tradier.com/v1";

// Determine report type from current time (ET)
function getReportTypeFromTime(): "morning" | "eod" | "weekly" | null {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const hour = et.getHours();
  const day = et.getDay(); // 0 = Sunday

  if (day === 0 && hour >= 20 && hour < 23) return "weekly";
  if (hour >= 9 && hour < 10) return "morning";
  if (hour >= 16 && hour < 17) return "eod";
  return null;
}

async function getVixLevel(): Promise<number> {
  const tradierKey = process.env.TRADIER_API_KEY;
  if (!tradierKey) return 18;
  try {
    const res = await fetch(`${TRADIER_BASE}/markets/quotes?symbols=VIX&greeks=false`, {
      headers: { Authorization: `Bearer ${tradierKey}`, Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      const q = data?.quotes?.quote;
      if (q) return q.last || q.close || 18;
    }
  } catch {}
  return 18;
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch (err) {
    console.error("Telegram send error:", err);
  }
}

async function generateMorningReport(db: any) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Fetch yesterday's trades
  const { data: userTrades } = await db.from("trades_user")
    .select("*").gte("entry_time", `${yesterday}T00:00:00`).lte("entry_time", `${yesterday}T23:59:59`);
  const { data: sysTrades } = await db.from("trades_system")
    .select("*").gte("entry_time", `${yesterday}T00:00:00`).lte("entry_time", `${yesterday}T23:59:59`);

  // Fetch watchlist
  const { data: watchlist } = await db.from("watchlist").select("symbol, quant_rank").eq("active", true).order("quant_rank");

  const vix = await getVixLevel();

  const userPnl = (userTrades || []).reduce((s: number, t: any) => s + (t.pnl || 0), 0);
  const sysPnl = (sysTrades || []).reduce((s: number, t: any) => s + (t.pnl || 0), 0);

  const regimeLabel = vix < 15 ? "Low Vol Trending" : vix < 22 ? "Normal" : vix < 35 ? "High Volatility" : "Crisis";

  const topTickers = (watchlist || []).slice(0, 5).map((w: any) => w.symbol).join(", ");

  let msg = `📊 *MORNING BRIEFING* — ${today}\n\n`;
  msg += `*Market:* VIX ${vix.toFixed(1)} (${regimeLabel})\n`;
  msg += `*Watchlist:* ${(watchlist || []).length} tickers — Top: ${topTickers || "none"}\n\n`;
  msg += `*Yesterday:*\n`;
  msg += `Your P&L: ${userPnl >= 0 ? "+" : ""}$${userPnl.toFixed(0)} (${(userTrades || []).length} trades)\n`;
  msg += `System P&L: ${sysPnl >= 0 ? "+" : ""}$${sysPnl.toFixed(0)} (${(sysTrades || []).length} trades)\n\n`;

  if (vix >= 35) {
    msg += `⚠️ *VIX is extreme — consider sitting out or reducing size.*\n\n`;
  }

  msg += `🎯 *Game Plan:* Watch top-ranked tickers for VWAP reclaim + volume surge at open. Only take signals ≥ threshold.\n`;
  msg += `\n_Good luck today! 🚀_`;

  return { text: msg, date: today, type: "morning" as const };
}

async function generateEodReport(db: any) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: userTrades } = await db.from("trades_user")
    .select("*").gte("entry_time", `${today}T00:00:00`).lte("entry_time", `${today}T23:59:59`);
  const { data: sysTrades } = await db.from("trades_system")
    .select("*").gte("entry_time", `${today}T00:00:00`).lte("entry_time", `${today}T23:59:59`);

  const uTrades = userTrades || [];
  const sTrades = sysTrades || [];
  const userPnl = uTrades.reduce((s: number, t: any) => s + (t.pnl || 0), 0);
  const sysPnl = sTrades.reduce((s: number, t: any) => s + (t.pnl || 0), 0);
  const userWins = uTrades.filter((t: any) => (t.pnl || 0) > 0).length;
  const sysWins = sTrades.filter((t: any) => (t.pnl || 0) > 0).length;
  const userWR = uTrades.length > 0 ? (userWins / uTrades.length * 100) : 0;
  const sysWR = sTrades.length > 0 ? (sysWins / sTrades.length * 100) : 0;

  // Find best and worst
  const allTrades = [...uTrades, ...sTrades];
  const best = allTrades.length > 0 ? allTrades.sort((a: any, b: any) => (b.pnl || 0) - (a.pnl || 0))[0] : null;
  const worst = allTrades.length > 0 ? [...allTrades].sort((a: any, b: any) => (a.pnl || 0) - (b.pnl || 0))[0] : null;

  let msg = `📈 *END OF DAY REPORT* — ${today}\n\n`;
  msg += `*Your Trades:* ${uTrades.length} | P&L: ${userPnl >= 0 ? "+" : ""}$${userPnl.toFixed(0)} | WR: ${userWR.toFixed(0)}%\n`;
  msg += `*System Trades:* ${sTrades.length} | P&L: ${sysPnl >= 0 ? "+" : ""}$${sysPnl.toFixed(0)} | WR: ${sysWR.toFixed(0)}%\n\n`;

  if (best) msg += `✅ *Best:* ${best.symbol} ${best.pnl >= 0 ? "+" : ""}$${(best.pnl || 0).toFixed(0)}\n`;
  if (worst && (worst.pnl || 0) < 0) msg += `❌ *Worst:* ${worst.symbol} $${(worst.pnl || 0).toFixed(0)}\n`;
  msg += `\n_Market closed. Review and rest. 🌙_`;

  // Save to Supabase
  const reportData = {
    date: today,
    user_pnl: userPnl,
    system_pnl: sysPnl,
    user_win_rate: userWR,
    system_win_rate: sysWR,
    user_trades_count: uTrades.length,
    system_trades_count: sTrades.length,
    report_json: { text: msg, bestTrade: best, worstTrade: worst },
  };

  await db.from("daily_reports").upsert(reportData, { onConflict: "date" });

  return { text: msg, date: today, type: "eod" as const, report: reportData };
}

async function generateWeeklyReport(db: any) {
  const now = new Date();
  const weekEnd = now.toISOString().slice(0, 10);
  const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const { data: userTrades } = await db.from("trades_user")
    .select("*").gte("entry_time", `${weekStart}T00:00:00`).lte("entry_time", `${weekEnd}T23:59:59`);
  const { data: sysTrades } = await db.from("trades_system")
    .select("*").gte("entry_time", `${weekStart}T00:00:00`).lte("entry_time", `${weekEnd}T23:59:59`);
  const { data: accountState } = await db.from("account_state").select("balance").order("updated_at", { ascending: false }).limit(1);

  const uTrades = userTrades || [];
  const sTrades = sysTrades || [];
  const userPnl = uTrades.reduce((s: number, t: any) => s + (t.pnl || 0), 0);
  const sysPnl = sTrades.reduce((s: number, t: any) => s + (t.pnl || 0), 0);
  const userWins = uTrades.filter((t: any) => (t.pnl || 0) > 0).length;
  const sysWins = sTrades.filter((t: any) => (t.pnl || 0) > 0).length;
  const userWR = uTrades.length > 0 ? (userWins / uTrades.length * 100) : 0;
  const sysWR = sTrades.length > 0 ? (sysWins / sTrades.length * 100) : 0;
  const balance = accountState?.[0]?.balance || 500;

  // Expectancy
  const userAvgWin = userWins > 0 ? uTrades.filter((t: any) => (t.pnl || 0) > 0).reduce((s: number, t: any) => s + (t.pnl || 0), 0) / userWins : 0;
  const userLosses = uTrades.length - userWins;
  const userAvgLoss = userLosses > 0 ? Math.abs(uTrades.filter((t: any) => (t.pnl || 0) <= 0).reduce((s: number, t: any) => s + (t.pnl || 0), 0) / userLosses) : 0;
  const expectancy = uTrades.length > 0 ? (userWR / 100 * userAvgWin) - ((100 - userWR) / 100 * userAvgLoss) : 0;
  const profitFactor = userAvgLoss > 0 ? (userAvgWin * userWins) / (userAvgLoss * userLosses) : 0;

  let msg = `📊 *WEEKLY REPORT* — ${weekStart} to ${weekEnd}\n\n`;
  msg += `*Your Trades:* ${uTrades.length} | P&L: ${userPnl >= 0 ? "+" : ""}$${userPnl.toFixed(0)} | WR: ${userWR.toFixed(0)}%\n`;
  msg += `*System Trades:* ${sTrades.length} | P&L: ${sysPnl >= 0 ? "+" : ""}$${sysPnl.toFixed(0)} | WR: ${sysWR.toFixed(0)}%\n\n`;
  msg += `*Stats:*\n`;
  msg += `Avg Win: $${userAvgWin.toFixed(0)} | Avg Loss: -$${userAvgLoss.toFixed(0)}\n`;
  msg += `Expectancy: $${expectancy.toFixed(0)}/trade\n`;
  msg += `Profit Factor: ${profitFactor.toFixed(2)}\n`;
  msg += `Account Balance: $${balance.toFixed(0)}\n\n`;

  if (sysPnl > userPnl && uTrades.length > 0) {
    msg += `💡 System outperformed you this week. Review which system signals you skipped.\n`;
  } else if (uTrades.length > 0) {
    msg += `✅ You outperformed the system! Keep refining your edge.\n`;
  }

  msg += `\n_See you Monday! 🏁_`;

  // Save to Supabase
  const reportData = {
    week_start: weekStart,
    week_end: weekEnd,
    report_json: {
      text: msg,
      userPnl, sysPnl, userWR, sysWR,
      userTrades: uTrades.length, systemTrades: sTrades.length,
      expectancy, profitFactor, balance,
    },
  };

  await db.from("weekly_reports").insert(reportData);

  return { text: msg, type: "weekly" as const, report: reportData };
}

// POST — manual trigger from UI
export async function POST(req: NextRequest) {
  try {
    const { type, sendTelegram: shouldSend } = await req.json();
    const db = getSupabaseServer();

    let result;
    if (type === "morning") result = await generateMorningReport(db);
    else if (type === "eod") result = await generateEodReport(db);
    else if (type === "weekly") result = await generateWeeklyReport(db);
    else return NextResponse.json({ error: "Invalid type" }, { status: 400 });

    if (shouldSend !== false) {
      await sendTelegram(result.text);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Report generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — Vercel cron handler (crons hit GET)
export async function GET() {
  try {
    const reportType = getReportTypeFromTime();
    if (!reportType) {
      return NextResponse.json({ message: "No report due at this time" });
    }

    const db = getSupabaseServer();
    let result;

    if (reportType === "morning") result = await generateMorningReport(db);
    else if (reportType === "eod") result = await generateEodReport(db);
    else result = await generateWeeklyReport(db);

    await sendTelegram(result.text);

    return NextResponse.json({ success: true, type: reportType });
  } catch (error: any) {
    console.error("Cron report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
