"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { comparePerformance, gradeTrade, PerformanceStats } from "@/lib/grading";
import { checkRiskBeforeTrade, DEFAULT_RISK_SETTINGS, RiskWarning } from "@/lib/risk";
import { sendTelegramMessage } from "@/lib/telegram";
import { PaperTrade } from "@/lib/types";
import { format } from "date-fns";
import {
  DollarSign, TrendingUp, TrendingDown, Target, BarChart3, Award,
  AlertTriangle, Download, Plus, X, ArrowUp, ArrowDown, Users, Bot,
} from "lucide-react";

type ViewTab = "user" | "system" | "compare";

export default function TradesView() {
  const {
    paperTrades, getPortfolioStats, addPaperTrade, closePaperTrade,
    quotes, startingBalance, signals,
  } = useStore();
  const [tab, setTab] = useState<ViewTab>("user");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState<string | null>(null);

  // Form state
  const [formSymbol, setFormSymbol] = useState("");
  const [formType, setFormType] = useState<"CALL" | "PUT">("CALL");
  const [formStrike, setFormStrike] = useState("");
  const [formExpiry, setFormExpiry] = useState("");
  const [formEntry, setFormEntry] = useState("");
  const [formQty, setFormQty] = useState("1");
  const [closePrice, setClosePrice] = useState("");
  const [closeReason, setCloseReason] = useState("");

  // Split trades by source
  const userTrades = paperTrades.filter((t) => t.source === "USER");
  const systemTrades = paperTrades.filter((t) => t.source === "SYSTEM" || !t.source); // legacy trades default to system

  // Live risk checks on the trade entry form
  const currentRiskWarnings = useMemo(() => {
    if (!showAddForm || !formEntry) return [];
    const cost = (parseFloat(formEntry) || 0) * (parseInt(formQty) || 1) * 100;
    if (cost <= 0) return [];
    return checkRiskBeforeTrade({
      contractCost: cost,
      accountBalance: startingBalance,
      openUserTrades: userTrades.filter((t) => t.status === "OPEN"),
      allUserTrades: userTrades,
      settings: DEFAULT_RISK_SETTINGS,
    });
  }, [showAddForm, formEntry, formQty, startingBalance, userTrades]);

  const activeTrades = tab === "user" ? userTrades : systemTrades;
  const openTrades = activeTrades.filter((t) => t.status === "OPEN");
  const closedTrades = activeTrades.filter((t) => t.status === "CLOSED");

  // Comparison
  const comparison = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayUser = userTrades.filter((t) => t.status === "CLOSED" && t.exitTime?.slice(0, 10) === today);
    const todaySys = systemTrades.filter((t) => t.status === "CLOSED" && t.exitTime?.slice(0, 10) === today);
    return comparePerformance(todayUser, todaySys);
  }, [userTrades, systemTrades]);

  // All-time comparison
  const allTimeComparison = useMemo(() => {
    const closedUser = userTrades.filter((t) => t.status === "CLOSED");
    const closedSys = systemTrades.filter((t) => t.status === "CLOSED");
    return comparePerformance(closedUser, closedSys);
  }, [userTrades, systemTrades]);

  // Add user trade
  const handleAddTrade = () => {
    if (!formSymbol || !formEntry) return;
    const sym = formSymbol.toUpperCase();
    const signal = signals[sym];
    const trade: PaperTrade = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: sym,
      type: formType,
      strike: parseFloat(formStrike) || 0,
      expiry: formExpiry,
      entryPrice: parseFloat(formEntry),
      quantity: parseInt(formQty) || 1,
      entryTime: new Date().toISOString(),
      status: "OPEN",
      signalScore: signal?.score || 0,
      source: "USER",
      signalId: signal ? `${sym}-${Date.now()}` : undefined,
    };
    addPaperTrade(trade);
    // Send Telegram risk warnings if any are DANGER level
    const dangerWarnings = currentRiskWarnings.filter((w) => w.severity === "DANGER" || w.severity === "WARNING");
    if (dangerWarnings.length > 0) {
      const msg = `⚠️ RISK WARNING — ${sym}\n\n` + dangerWarnings.map((w) => `${w.message}`).join("\n");
      sendTelegramMessage(msg).catch(() => {});
    }
    setShowAddForm(false);
    setFormSymbol(""); setFormStrike(""); setFormExpiry(""); setFormEntry(""); setFormQty("1");
  };

  // Close trade with grading
  const handleCloseTrade = (tradeId: string) => {
    if (!closePrice) return;
    const price = parseFloat(closePrice);
    closePaperTrade(tradeId, price, closeReason || "Manual close");

    // Grade it after closing
    const trade = paperTrades.find((t) => t.id === tradeId);
    if (trade) {
      const signal = signals[trade.symbol];
      const result = gradeTrade({ ...trade, exitPrice: price, status: "CLOSED",
        pnlPercent: ((price - trade.entryPrice) / trade.entryPrice) * 100,
      }, signal, startingBalance);
      // Note: grade is stored via the grading function but we'd need to update the store
      // For now it's computed on display
    }

    setShowCloseForm(null);
    setClosePrice(""); setCloseReason("");
  };

  // CSV export
  const exportCSV = () => {
    const headers = ["Source","Symbol","Type","Strike","Expiry","Entry","Exit","Qty","P&L $","P&L %","Entry Time","Exit Time","Reason"];
    const rows = paperTrades.map((t) => [
      t.source || "SYSTEM", t.symbol, t.type, t.strike, t.expiry,
      t.entryPrice?.toFixed(2), t.exitPrice?.toFixed(2) || "", t.quantity,
      t.pnl?.toFixed(2) || "0", t.pnlPercent?.toFixed(2) || "0",
      t.entryTime, t.exitTime || "", t.exitReason || "",
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "quantedge-trades.csv"; a.click();
  };

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-2">
        {([
          { key: "user", label: "My Trades", icon: Users },
          { key: "system", label: "System Trades", icon: Bot },
          { key: "compare", label: "Compare", icon: BarChart3 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all ${
              tab === key ? "bg-accent-green-dim text-accent-green border border-accent-green/30" :
              "bg-bg-card border border-bg-border text-text-secondary hover:text-text-primary"
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {tab === "user" && (
            <button onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-green-dim border border-accent-green/30 text-accent-green text-sm font-mono hover:bg-accent-green/20 transition-all">
              <Plus className="w-4 h-4" /> Log Trade
            </button>
          )}
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg-card border border-bg-border text-text-secondary text-sm font-mono hover:text-text-primary transition-all">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {/* Compare Tab */}
      {tab === "compare" && (
        <div className="space-y-4">
          <div className="bg-bg-card border border-bg-border rounded-xl p-5">
            <h3 className="font-display font-bold text-text-primary mb-3">Today's Comparison</h3>
            <p className="text-sm text-text-secondary mb-4">{comparison.summary}</p>
            <div className="grid grid-cols-2 gap-4">
              <StatsColumn title="Your Trades" stats={comparison.user} color="blue" />
              <StatsColumn title="System Trades" stats={comparison.system} color="green" />
            </div>
          </div>
          <div className="bg-bg-card border border-bg-border rounded-xl p-5">
            <h3 className="font-display font-bold text-text-primary mb-3">All-Time Comparison</h3>
            <p className="text-sm text-text-secondary mb-4">{allTimeComparison.summary}</p>
            <div className="grid grid-cols-2 gap-4">
              <StatsColumn title="Your Trades" stats={allTimeComparison.user} color="blue" />
              <StatsColumn title="System Trades" stats={allTimeComparison.system} color="green" />
            </div>
          </div>
        </div>
      )}

      {/* Trade Entry Form */}
      {showAddForm && (
        <div className="bg-bg-card border border-accent-green/30 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-text-primary">Log New Trade</h3>
            <button onClick={() => setShowAddForm(false)} className="text-text-muted hover:text-text-primary"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <input value={formSymbol} onChange={(e) => setFormSymbol(e.target.value)} placeholder="Ticker"
              className="bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted" />
            <select value={formType} onChange={(e) => setFormType(e.target.value as any)}
              className="bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary">
              <option value="CALL">CALL</option><option value="PUT">PUT</option>
            </select>
            <input value={formStrike} onChange={(e) => setFormStrike(e.target.value)} placeholder="Strike" type="number"
              className="bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted" />
            <input value={formExpiry} onChange={(e) => setFormExpiry(e.target.value)} placeholder="Expiry" type="date"
              className="bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary" />
            <input value={formEntry} onChange={(e) => setFormEntry(e.target.value)} placeholder="Entry $" type="number" step="0.01"
              className="bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted" />
            <input value={formQty} onChange={(e) => setFormQty(e.target.value)} placeholder="Qty" type="number"
              className="bg-bg-primary border border-bg-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary" />
          </div>
          {formSymbol && signals[formSymbol.toUpperCase()] && (
            <div className="mt-2 text-xs text-text-muted font-mono">
              Signal: {signals[formSymbol.toUpperCase()].score}/100 {signals[formSymbol.toUpperCase()].direction} ({signals[formSymbol.toUpperCase()].confidence})
            </div>
          )}
          {/* Risk warnings */}
          {currentRiskWarnings.length > 0 && (
            <div className="mt-3 space-y-2">
              {currentRiskWarnings.map((w) => (
                <div key={w.id} className={`rounded-lg px-3 py-2 text-xs font-mono flex items-start gap-2 ${
                  w.severity === "BLOCK" ? "bg-accent-red-dim border border-accent-red/40 text-accent-red" :
                  w.severity === "DANGER" ? "bg-accent-red-dim border border-accent-red/30 text-accent-red" :
                  "bg-accent-amber-dim border border-accent-amber/30 text-accent-amber"
                }`}>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bold">{w.message}</div>
                    <div className="opacity-80 mt-0.5">{w.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 mt-3">
            <button onClick={handleAddTrade}
              disabled={currentRiskWarnings.some((w) => w.severity === "BLOCK")}
              className={`px-4 py-2 rounded-lg font-mono font-bold text-sm transition-all ${
                currentRiskWarnings.some((w) => w.severity === "BLOCK")
                  ? "bg-text-muted/20 text-text-muted cursor-not-allowed"
                  : "bg-accent-green text-black hover:bg-accent-green/80"
              }`}>
              {currentRiskWarnings.some((w) => w.severity === "BLOCK") ? "Blocked" : "Log Trade"}
            </button>
            {currentRiskWarnings.length > 0 && !currentRiskWarnings.some((w) => w.severity === "BLOCK") && (
              <span className="text-[10px] text-accent-amber font-mono">⚠️ Warnings above — proceed with caution</span>
            )}
          </div>
        </div>
      )}

      {/* Trades list (user or system tab) */}
      {tab !== "compare" && (
        <>
          {/* Open Positions */}
          {openTrades.length > 0 && (
            <div>
              <h3 className="font-display font-semibold text-text-primary mb-3">Open Positions ({openTrades.length})</h3>
              <div className="space-y-2">
                {openTrades.map((trade) => {
                  const quote = quotes[trade.symbol];
                  const currentPrice = quote?.price || 0;
                  const estOptionPrice = trade.entryPrice + ((currentPrice - trade.strike) * 0.01 * (trade.type === "CALL" ? 1 : -1));
                  const livePnl = (Math.max(estOptionPrice, 0.01) - trade.entryPrice) * trade.quantity * 100;
                  const livePnlPct = ((Math.max(estOptionPrice, 0.01) - trade.entryPrice) / trade.entryPrice) * 100;

                  return (
                    <div key={trade.id} className="bg-bg-card border border-bg-border rounded-xl p-4 flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-text-primary">{trade.symbol}</span>
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${trade.type === "CALL" ? "bg-accent-green-dim text-accent-green" : "bg-accent-red-dim text-accent-red"}`}>
                            {trade.type}
                          </span>
                          <span className="text-xs text-text-muted font-mono">${trade.strike} {trade.expiry}</span>
                          {trade.source === "USER" && <span className="text-[9px] bg-accent-blue-dim text-accent-blue px-1 rounded">YOU</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs font-mono text-text-secondary">
                          <span>Entry: ${trade.entryPrice.toFixed(2)}</span>
                          <span>Qty: {trade.quantity}</span>
                          <span className={livePnl >= 0 ? "text-accent-green" : "text-accent-red"}>
                            P&L: {livePnl >= 0 ? "+" : ""}${livePnl.toFixed(0)} ({livePnlPct >= 0 ? "+" : ""}{livePnlPct.toFixed(0)}%)
                          </span>
                          {livePnlPct >= 35 && <span className="text-accent-amber">💡 Consider taking profits</span>}
                        </div>
                      </div>
                      {tab === "user" && (
                        showCloseForm === trade.id ? (
                          <div className="flex items-center gap-2">
                            <input value={closePrice} onChange={(e) => setClosePrice(e.target.value)} placeholder="Exit $" type="number" step="0.01"
                              className="w-20 bg-bg-primary border border-bg-border rounded px-2 py-1 text-xs font-mono text-text-primary" />
                            <button onClick={() => handleCloseTrade(trade.id)}
                              className="px-2 py-1 rounded bg-accent-red text-white text-xs font-mono">Close</button>
                            <button onClick={() => setShowCloseForm(null)} className="text-text-muted"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <button onClick={() => setShowCloseForm(trade.id)}
                            className="px-3 py-1.5 rounded-lg bg-accent-red-dim border border-accent-red/30 text-accent-red text-xs font-mono">
                            Close
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Closed Trades */}
          <div>
            <h3 className="font-display font-semibold text-text-primary mb-3">Closed Trades ({closedTrades.length})</h3>
            {closedTrades.length === 0 ? (
              <div className="bg-bg-card border border-bg-border rounded-xl p-8 text-center text-text-muted text-sm">
                No closed trades yet. {tab === "user" ? "Log your first trade above." : "System will auto-trade when signals fire."}
              </div>
            ) : (
              <div className="space-y-2">
                {closedTrades.slice(0, 50).map((trade) => {
                  const pnlColor = (trade.pnl || 0) >= 0 ? "text-accent-green" : "text-accent-red";
                  const signal = signals[trade.symbol];
                  const gradeResult = trade.status === "CLOSED" ? gradeTrade(trade, signal, startingBalance) : null;

                  return (
                    <div key={trade.id} className="bg-bg-card border border-bg-border rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-text-primary">{trade.symbol}</span>
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${trade.type === "CALL" ? "bg-accent-green-dim text-accent-green" : "bg-accent-red-dim text-accent-red"}`}>
                            {trade.type}
                          </span>
                          <span className="text-xs text-text-muted font-mono">${trade.strike}</span>
                          {trade.source === "USER" && <span className="text-[9px] bg-accent-blue-dim text-accent-blue px-1 rounded">YOU</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {gradeResult && (
                            <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${
                              gradeResult.grade === "A" ? "bg-accent-green-dim text-accent-green" :
                              gradeResult.grade === "B" ? "bg-accent-blue-dim text-accent-blue" :
                              gradeResult.grade === "C" ? "bg-accent-amber-dim text-accent-amber" :
                              "bg-accent-red-dim text-accent-red"
                            }`}>{gradeResult.grade}</span>
                          )}
                          <span className={`font-mono font-bold ${pnlColor}`}>
                            {(trade.pnl || 0) >= 0 ? "+" : ""}${(trade.pnl || 0).toFixed(0)}
                          </span>
                          <span className={`text-xs font-mono ${pnlColor}`}>
                            {(trade.pnlPercent || 0) >= 0 ? "+" : ""}{(trade.pnlPercent || 0).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-[10px] font-mono text-text-muted">
                        <span>In: ${trade.entryPrice.toFixed(2)} → Out: ${trade.exitPrice?.toFixed(2) || "?"}</span>
                        <span>Qty: {trade.quantity}</span>
                        <span>Signal: {trade.signalScore}</span>
                        {trade.exitReason && <span>Reason: {trade.exitReason}</span>}
                      </div>
                      {gradeResult && (
                        <div className="mt-2 text-[10px] text-text-secondary font-mono leading-relaxed bg-bg-primary rounded-lg p-2">
                          {gradeResult.explanation.slice(0, 200)}{gradeResult.explanation.length > 200 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatsColumn({ title, stats, color }: { title: string; stats: PerformanceStats; color: "blue" | "green" }) {
  const c = color === "blue" ? "text-accent-blue" : "text-accent-green";
  const bg = color === "blue" ? "bg-accent-blue-dim" : "bg-accent-green-dim";
  return (
    <div className={`${bg} rounded-xl p-4 space-y-2`}>
      <h4 className={`font-mono font-bold text-sm ${c}`}>{title}</h4>
      <StatRow label="Trades" value={stats.totalTrades.toString()} />
      <StatRow label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} color={stats.winRate >= 50 ? "green" : "red"} />
      <StatRow label="Total P&L" value={`$${stats.totalPnl.toFixed(0)}`} color={stats.totalPnl >= 0 ? "green" : "red"} />
      <StatRow label="Avg Win" value={`$${stats.avgWin.toFixed(0)}`} color="green" />
      <StatRow label="Avg Loss" value={`$${stats.avgLoss.toFixed(0)}`} color="red" />
      <StatRow label="Expectancy" value={`$${stats.expectancy.toFixed(0)}/trade`} color={stats.expectancy >= 0 ? "green" : "red"} />
      <StatRow label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} />
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: "green" | "red" }) {
  const c = color === "green" ? "text-accent-green" : color === "red" ? "text-accent-red" : "text-text-primary";
  return (
    <div className="flex justify-between text-xs font-mono">
      <span className="text-text-muted">{label}</span>
      <span className={c}>{value}</span>
    </div>
  );
}
