"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { generateMorningBriefing, generateEODReport, generateWeeklyReport, MorningBriefing, EODReport, WeeklyReport } from "@/lib/reports";
import { sendTelegramMessage } from "@/lib/telegram";
import { Sun, Moon, Calendar, Send, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

type ReportTab = "morning" | "eod" | "weekly";

export default function ReportsView() {
  const {
    paperTrades, signals, spyQuote, vixLevel, marketRegime,
    marketEvents, watchlist, startingBalance,
  } = useStore();

  const [tab, setTab] = useState<ReportTab>("eod");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Generate morning briefing
  const morningBriefing = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const yesterdayTrades = paperTrades.filter((t) =>
      t.status === "CLOSED" && t.exitTime?.slice(0, 10) === yesterdayStr
    );
    return generateMorningBriefing({
      spyQuote, vixLevel, regime: marketRegime,
      events: marketEvents,
      yesterdayTrades,
      watchlist: watchlist.map((w) => ({ symbol: w.symbol, quantRank: w.quantRank })),
    });
  }, [paperTrades, spyQuote, vixLevel, marketRegime, marketEvents, watchlist]);

  // Generate EOD report
  const eodReport = useMemo(() => {
    return generateEODReport({
      allTrades: paperTrades,
      accountBalance: startingBalance,
      dailyLossLimit: startingBalance * 0.10,
    });
  }, [paperTrades, startingBalance]);

  // Generate weekly report
  const weeklyReport = useMemo(() => {
    return generateWeeklyReport({
      allTrades: paperTrades,
      signals,
      startingBalance,
    });
  }, [paperTrades, signals, startingBalance]);

  // Send via Telegram
  const handleSend = async (text: string, label: string) => {
    setSending(true);
    const ok = await sendTelegramMessage(text);
    setSending(false);
    setSent(ok ? label : null);
    if (ok) setTimeout(() => setSent(null), 3000);
  };

  // Generate server-side report (pulls from Supabase, stores in DB, sends Telegram)
  const [serverGenerating, setServerGenerating] = useState(false);
  const [serverResult, setServerResult] = useState<string | null>(null);
  const handleServerGenerate = async (type: ReportTab) => {
    setServerGenerating(true);
    setServerResult(null);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, sendTelegram: true }),
      });
      const data = await res.json();
      if (data.success) {
        setServerResult("✅ Report generated, saved to DB, and sent to Telegram!");
      } else {
        setServerResult(`❌ ${data.error || "Failed to generate"}`);
      }
    } catch (err) {
      setServerResult("❌ Server error — check Supabase connection");
    }
    setServerGenerating(false);
    setTimeout(() => setServerResult(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-2">
        {([
          { key: "morning" as const, label: "Morning Briefing", icon: Sun },
          { key: "eod" as const, label: "End of Day", icon: Moon },
          { key: "weekly" as const, label: "Weekly Report", icon: Calendar },
        ]).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all ${
              tab === key ? "bg-accent-green-dim text-accent-green border border-accent-green/30" :
              "bg-bg-card border border-bg-border text-text-secondary hover:text-text-primary"
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}

        {/* Server-side generate button */}
        <button
          onClick={() => handleServerGenerate(tab)}
          disabled={serverGenerating}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg-hover border border-bg-border text-text-secondary text-xs font-mono hover:border-accent-blue/40 hover:text-accent-blue transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${serverGenerating ? "animate-spin" : ""}`} />
          {serverGenerating ? "Generating..." : "Generate from DB"}
        </button>
      </div>

      {/* Server result banner */}
      {serverResult && (
        <div className={`rounded-lg px-4 py-2 text-xs font-mono ${
          serverResult.startsWith("✅") ? "bg-accent-green-dim text-accent-green" : "bg-accent-red-dim text-accent-red"
        }`}>
          {serverResult}
        </div>
      )}

      {/* Morning Briefing */}
      {tab === "morning" && (
        <ReportCard
          title="Morning Briefing"
          subtitle={morningBriefing.date}
          onSend={() => handleSend(morningBriefing.fullText, "morning")}
          sending={sending} sent={sent === "morning"}
        >
          <div className="space-y-4">
            <ReportSection title="Market Outlook" content={morningBriefing.marketOutlook} />
            <ReportSection title="Events Today"
              content={morningBriefing.events.length > 0
                ? morningBriefing.events.map((e) => `${e.type === "earnings" ? "📊" : "⚠️"} ${e.description}${e.time ? ` @ ${e.time}` : ""}`).join("\n")
                : "No major events today."
              }
            />
            <ReportSection title="Yesterday's Recap"
              content={`You: ${morningBriefing.yesterdayRecap.userPnl >= 0 ? "+" : ""}$${morningBriefing.yesterdayRecap.userPnl.toFixed(0)} (${morningBriefing.yesterdayRecap.userTrades} trades) | System: ${morningBriefing.yesterdayRecap.systemPnl >= 0 ? "+" : ""}$${morningBriefing.yesterdayRecap.systemPnl.toFixed(0)} (${morningBriefing.yesterdayRecap.systemTrades} trades)\n${morningBriefing.yesterdayRecap.lesson}`}
            />
            <ReportSection title="Game Plan" content={morningBriefing.gamePlan} />
          </div>
        </ReportCard>
      )}

      {/* EOD Report */}
      {tab === "eod" && (
        <ReportCard
          title="End-of-Day Report"
          subtitle={eodReport.date}
          onSend={() => handleSend(eodReport.fullText, "eod")}
          sending={sending} sent={sent === "eod"}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Your P&L" value={`${eodReport.userPnl >= 0 ? "+" : ""}$${eodReport.userPnl.toFixed(0)}`} color={eodReport.userPnl >= 0 ? "green" : "red"} />
              <MiniStat label="System P&L" value={`${eodReport.systemPnl >= 0 ? "+" : ""}$${eodReport.systemPnl.toFixed(0)}`} color={eodReport.systemPnl >= 0 ? "green" : "red"} />
              <MiniStat label="Your Win Rate" value={`${eodReport.userWinRate.toFixed(0)}%`} color={eodReport.userWinRate >= 50 ? "green" : "amber"} />
              <MiniStat label="System Win Rate" value={`${eodReport.systemWinRate.toFixed(0)}%`} color={eodReport.systemWinRate >= 50 ? "green" : "amber"} />
            </div>

            {/* Trade list */}
            {(eodReport.userTrades.length > 0 || eodReport.systemTrades.length > 0) && (
              <div>
                <h4 className="text-xs font-mono text-text-muted uppercase mb-2">Trades Today</h4>
                <div className="space-y-1">
                  {[...eodReport.userTrades, ...eodReport.systemTrades]
                    .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime())
                    .slice(0, 15)
                    .map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-text-secondary">
                          <span className={`${t.source === "USER" ? "text-accent-blue" : "text-text-muted"}`}>
                            [{t.source === "USER" ? "YOU" : "SYS"}]
                          </span>
                          {" "}{t.symbol} {t.type}
                        </span>
                        <span className={(t.pnl || 0) >= 0 ? "text-accent-green" : "text-accent-red"}>
                          {(t.pnl || 0) >= 0 ? "+" : ""}${(t.pnl || 0).toFixed(0)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <ReportSection title="Risk Compliance" content={eodReport.riskCompliance} />
            <ReportSection title="Biggest Mistake" content={eodReport.biggestMistake} />
            <ReportSection title="Education Tip" content={eodReport.educationTip} highlight />
          </div>
        </ReportCard>
      )}

      {/* Weekly Report */}
      {tab === "weekly" && (
        <ReportCard
          title="Weekly Performance Report"
          subtitle={`${weeklyReport.weekStart} — ${weeklyReport.weekEnd}`}
          onSend={() => handleSend(weeklyReport.fullText, "weekly")}
          sending={sending} sent={sent === "weekly"}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Your P&L" value={`${weeklyReport.userStats.totalPnl >= 0 ? "+" : ""}$${weeklyReport.userStats.totalPnl.toFixed(0)}`} color={weeklyReport.userStats.totalPnl >= 0 ? "green" : "red"} />
              <MiniStat label="System P&L" value={`${weeklyReport.systemStats.totalPnl >= 0 ? "+" : ""}$${weeklyReport.systemStats.totalPnl.toFixed(0)}`} color={weeklyReport.systemStats.totalPnl >= 0 ? "green" : "red"} />
              <MiniStat label="Your Win Rate" value={`${weeklyReport.userStats.winRate.toFixed(0)}%`} color={weeklyReport.userStats.winRate >= 50 ? "green" : "amber"} />
              <MiniStat label="Expectancy" value={`$${weeklyReport.userStats.expectancy.toFixed(0)}/trade`} color={weeklyReport.userStats.expectancy >= 0 ? "green" : "red"} />
            </div>

            <div className="bg-bg-primary rounded-lg p-3 text-center">
              <span className="text-xs font-mono text-text-muted">Winner: </span>
              <span className="font-mono font-bold text-lg">
                {weeklyReport.winner === "USER" ? "🏆 You" : weeklyReport.winner === "SYSTEM" ? "🤖 System" : "🤝 Tie"}
              </span>
            </div>

            <ReportSection title="Best Trade" content={weeklyReport.bestTrade} />
            <ReportSection title="Worst Trade" content={weeklyReport.worstTrade} />
            <ReportSection title="Patterns" content={weeklyReport.patternAnalysis} highlight />
            <ReportSection title="Account Growth" content={`${weeklyReport.accountGrowth >= 0 ? "+" : ""}${weeklyReport.accountGrowth.toFixed(1)}% this week`} />
          </div>
        </ReportCard>
      )}
    </div>
  );
}

function ReportCard({ title, subtitle, onSend, sending, sent, children }: {
  title: string; subtitle: string; onSend: () => void; sending: boolean; sent: boolean; children: React.ReactNode;
}) {
  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-bold text-text-primary">{title}</h3>
          <span className="text-xs font-mono text-text-muted">{subtitle}</span>
        </div>
        <button onClick={onSend} disabled={sending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-blue-dim border border-accent-blue/30 text-accent-blue text-xs font-mono hover:bg-accent-blue/20 transition-all disabled:opacity-50">
          <Send className="w-3 h-3" />
          {sent ? "Sent ✓" : sending ? "Sending..." : "Send to Telegram"}
        </button>
      </div>
      {children}
    </div>
  );
}

function ReportSection({ title, content, highlight }: { title: string; content: string; highlight?: boolean }) {
  return (
    <div className={`${highlight ? "bg-accent-blue-dim/50 border border-accent-blue/20" : "bg-bg-primary"} rounded-lg p-3`}>
      <h4 className="text-[10px] font-mono text-text-muted uppercase mb-1">{title}</h4>
      <p className="text-sm text-text-primary font-mono whitespace-pre-line">{content}</p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: "green" | "red" | "amber" }) {
  const c = color === "green" ? "text-accent-green" : color === "red" ? "text-accent-red" : "text-accent-amber";
  return (
    <div className="bg-bg-primary rounded-lg p-3">
      <div className="text-[10px] font-mono text-text-muted uppercase">{label}</div>
      <div className={`font-mono font-bold text-lg ${c}`}>{value}</div>
    </div>
  );
}
