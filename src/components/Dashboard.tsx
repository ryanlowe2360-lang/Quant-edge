"use client";

import { useStore } from "@/lib/store";
import { marketBreadth } from "@/lib/signals";
import SignalCard from "./SignalCard";
import { DashboardSkeleton } from "./Skeleton";
import {
  RefreshCw, TrendingUp, TrendingDown, Target, Shield, Zap, Activity,
  AlertTriangle, Calendar, DollarSign, BarChart2,
} from "lucide-react";
import { useMarketData } from "@/hooks/useMarketData";

export default function Dashboard() {
  const {
    getWatchlistWithData, signals, signalThreshold, optionsLiquidity,
    marketRegime, spyQuote, vixLevel, marketEvents,
    paperTrades, watchlist,
  } = useStore();
  const { refresh } = useMarketData();
  const stocks = getWatchlistWithData();

  const allSignals = Object.values(signals);
  const breadth = marketBreadth(allSignals);
  const isLoading = stocks.length > 0 && allSignals.length === 0;

  // Sort by signal score descending
  // Regime-adjusted threshold (10.2)
  const regimeAdjustment = marketRegime?.thresholdAdjustment || 0;
  const adjustedThreshold = Math.max(50, Math.min(95, signalThreshold + regimeAdjustment));
  const regimeRiskMultiplier = marketRegime?.riskMultiplier || 1.0;

  const sorted = [...stocks].sort(
    (a, b) => (b.signal?.score || 0) - (a.signal?.score || 0)
  );

  const hotPicks = sorted.filter((s) => (s.signal?.score || 0) >= adjustedThreshold);
  const warming = sorted.filter(
    (s) => (s.signal?.score || 0) >= 40 && (s.signal?.score || 0) < adjustedThreshold
  );
  const cold = sorted.filter((s) => (s.signal?.score || 0) < 40);

  // Today's P&L
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = paperTrades.filter(
    (t) => t.status === "CLOSED" && t.exitTime && t.exitTime.slice(0, 10) === today
  );
  const todayPnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  // Consecutive losses (tilt detection)
  const recentClosed = paperTrades
    .filter((t) => t.status === "CLOSED")
    .slice(0, 10);
  let consecutiveLosses = 0;
  for (const t of recentClosed) {
    if ((t.pnl || 0) < 0) consecutiveLosses++;
    else break;
  }

  // Today's events
  const todayEvents = marketEvents.filter((e) => e.date === today);

  // VIX color
  const vixColor = vixLevel < 15 ? "text-accent-green" : vixLevel < 25 ? "text-accent-amber" : "text-accent-red";
  const vixBg = vixLevel < 15 ? "bg-accent-green-dim" : vixLevel < 25 ? "bg-accent-amber-dim" : "bg-accent-red-dim";

  // SPY direction
  const spyChange = spyQuote?.changePercent || 0;
  const spyDir = spyChange > 0.3 ? "BULLISH" : spyChange < -0.3 ? "BEARISH" : "CHOPPY";
  const spyColor = spyDir === "BULLISH" ? "text-accent-green" : spyDir === "BEARISH" ? "text-accent-red" : "text-accent-amber";

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* ── Market Pulse Bar ─────────────────────────────── */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {/* SPY */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted font-mono text-xs">SPY</span>
            {spyQuote ? (
              <>
                <span className="font-mono text-text-primary font-bold">${spyQuote.price.toFixed(2)}</span>
                <span className={`font-mono text-xs ${spyColor}`}>
                  {spyChange >= 0 ? "+" : ""}{spyChange.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="font-mono text-text-muted text-xs">Loading...</span>
            )}
          </div>

          <div className="w-px h-5 bg-bg-border" />

          {/* VIX */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted font-mono text-xs">VIX</span>
            <span className={`font-mono font-bold ${vixColor}`}>{vixLevel > 0 ? vixLevel.toFixed(1) : "—"}</span>
            {vixLevel > 0 && (
              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${vixBg} ${vixColor}`}>
                {vixLevel < 15 ? "LOW" : vixLevel < 25 ? "NORMAL" : vixLevel < 35 ? "HIGH" : "EXTREME"}
              </span>
            )}
          </div>

          <div className="w-px h-5 bg-bg-border" />

          {/* Regime */}
          {marketRegime && (
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3 text-text-muted" />
              <span className={`text-xs font-mono font-bold ${
                marketRegime.regime === "LOW_VOL_TREND" ? "text-accent-green" :
                marketRegime.regime === "NORMAL" ? "text-text-primary" :
                marketRegime.regime === "HIGH_VOL" ? "text-accent-amber" : "text-accent-red"
              }`}>
                {marketRegime.regime === "LOW_VOL_TREND" ? "TRENDING" :
                 marketRegime.regime === "NORMAL" ? "NORMAL" :
                 marketRegime.regime === "HIGH_VOL" ? "HIGH VOLATILITY — CAUTION" : "CRISIS — REDUCE SIZE"}
              </span>
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={refresh}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg bg-bg-hover border border-bg-border text-text-secondary text-xs font-mono hover:border-accent-green/40 hover:text-accent-green transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Event Banner ─────────────────────────────────── */}
      {todayEvents.length > 0 && (() => {
        const watchlistSymbols = new Set(watchlist.map((w) => w.symbol));
        const relevantEarnings = todayEvents.filter((e) => e.type === "earnings" && e.symbol && watchlistSymbols.has(e.symbol));
        const economicEvents = todayEvents.filter((e) => e.type === "economic").slice(0, 5);
        const showEvents = [...relevantEarnings, ...economicEvents];

        return showEvents.length > 0 ? (
          <div className="bg-accent-amber-dim border border-accent-amber/20 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-accent-amber flex-shrink-0" />
              <span className="text-xs font-mono font-bold text-accent-amber uppercase">Today's Events</span>
            </div>
            <div className="space-y-1">
              {relevantEarnings.length > 0 && (
                <div className="text-xs font-mono text-accent-amber">
                  📊 Earnings: {relevantEarnings.map((e) => `${e.symbol}${e.time ? ` (${e.time})` : ""}`).join(", ")}
                </div>
              )}
              {economicEvents.length > 0 && (
                <div className="text-xs font-mono text-accent-amber">
                  ⚠️ Economic: {economicEvents.map((e) => e.description.split(" @ ")[0].split(" YoY")[0]).join(" • ")}
                </div>
              )}
            </div>
          </div>
        ) : null;
      })()}

      {/* ── Tilt Warning ─────────────────────────────────── */}
      {consecutiveLosses >= 3 && (
        <div className="bg-accent-red-dim border border-accent-red/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-accent-red flex-shrink-0" />
          <div>
            <span className="text-accent-red font-mono font-bold text-sm">{consecutiveLosses} consecutive losses.</span>
            <span className="text-accent-red/80 text-xs ml-2">Consider stopping for today. Review your last trades before taking another.</span>
          </div>
        </div>
      )}
      {consecutiveLosses === 2 && (
        <div className="bg-accent-amber-dim border border-accent-amber/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-accent-amber flex-shrink-0" />
          <span className="text-accent-amber text-xs font-mono">2 losses in a row — slow down and review before your next trade.</span>
        </div>
      )}

      {/* ── Sit-Out Warning (10.6) ───────────────────────── */}
      {vixLevel >= 35 && (
        <div className="bg-accent-red-dim border border-accent-red/40 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-accent-red flex-shrink-0" />
          <div>
            <span className="text-accent-red font-mono font-bold text-sm">VIX {vixLevel.toFixed(1)} — Consider sitting out today.</span>
            <span className="text-accent-red/80 text-xs ml-2">Extreme volatility destroys option premiums unpredictably. Cash is a position.</span>
          </div>
        </div>
      )}

      {/* ── Regime Adjustment Notice ─────────────────────── */}
      {regimeAdjustment !== 0 && (
        <div className="bg-bg-card border border-bg-border rounded-lg px-4 py-2 flex items-center gap-2 text-xs font-mono text-text-muted">
          <Activity className="w-3 h-3" />
          Threshold adjusted to {adjustedThreshold} (base {signalThreshold} {regimeAdjustment > 0 ? "+" : ""}{regimeAdjustment} for {marketRegime?.regime?.replace(/_/g, " ").toLowerCase()}).
          {regimeRiskMultiplier < 1 && ` Position sizes reduced to ${(regimeRiskMultiplier * 100).toFixed(0)}%.`}
        </div>
      )}

      {/* ── Stats Row ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Signal Avg" value={breadth.avgScore.toFixed(0)}
          icon={<Zap className="w-4 h-4" />}
          color={breadth.avgScore >= 50 ? "green" : breadth.avgScore >= 30 ? "amber" : "red"}
        />
        <StatCard
          label="Bullish" value={`${breadth.bullishPercent.toFixed(0)}%`}
          icon={<TrendingUp className="w-4 h-4" />}
          color={breadth.bullishPercent >= 50 ? "green" : "amber"}
        />
        <StatCard
          label="Bearish" value={`${breadth.bearishPercent.toFixed(0)}%`}
          icon={<TrendingDown className="w-4 h-4" />}
          color={breadth.bearishPercent >= 30 ? "red" : "amber"}
        />
        <StatCard
          label="Hot Signals" value={hotPicks.length.toString()}
          icon={<Target className="w-4 h-4" />}
          color="green"
        />
        <StatCard
          label="Today P&L"
          value={`${todayPnl >= 0 ? "+" : ""}$${todayPnl.toFixed(0)}`}
          icon={<DollarSign className="w-4 h-4" />}
          color={todayPnl >= 0 ? "green" : "red"}
        />
      </div>

      {/* ── Watchlist Heatmap ────────────────────────────── */}
      {stocks.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-text-primary text-sm mb-2">Watchlist Heatmap</h3>
          <div className="flex flex-wrap gap-1.5">
            {sorted.map((stock) => {
              const s = stock.signal?.score || 0;
              const dir = stock.signal?.direction || "NEUTRAL";
              let bg = "bg-bg-hover text-text-muted";
              if (s >= 85) bg = dir === "SHORT" ? "bg-accent-red text-white" : "bg-accent-green text-black";
              else if (s >= 70) bg = dir === "SHORT" ? "bg-accent-red/70 text-white" : "bg-accent-green/70 text-black";
              else if (s >= 50) bg = "bg-accent-amber/60 text-black";
              else if (s >= 30) bg = "bg-accent-amber/30 text-text-primary";
              return (
                <div key={stock.symbol} className={`${bg} rounded px-2 py-1 text-xs font-mono font-bold cursor-pointer hover:opacity-80 transition-all`} title={`${stock.symbol}: ${s}`}>
                  {stock.symbol}
                  <span className="ml-1 opacity-70">{s}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────── */}
      {stocks.length === 0 && (
        <div className="bg-bg-card border border-bg-border rounded-xl p-12 text-center">
          <Zap className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <h3 className="font-display font-bold text-text-primary text-lg mb-2">
            No stocks on your watchlist
          </h3>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Head to the Watchlist tab to add your quant picks. Once added, the signal
            engine will scan them every 60 seconds and alert you when entry conditions are met.
          </p>
        </div>
      )}

      {/* ── Hot Picks ────────────────────────────────────── */}
      {hotPicks.length > 0 && (
        <Section title={`🔥 Hot Signals`} subtitle={`Score ≥ ${adjustedThreshold}${regimeAdjustment !== 0 ? ` (adjusted)` : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {hotPicks.map((stock) => (
              <SignalCard
                key={stock.symbol} symbol={stock.symbol}
                quote={stock.quote} signal={stock.signal}
                liquidity={optionsLiquidity[stock.symbol]}
                quantRank={stock.quantRank} quantScore={stock.quantScore}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Warming Up ───────────────────────────────────── */}
      {warming.length > 0 && (
        <Section title="Warming Up" subtitle="Score 40–69">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {warming.map((stock) => (
              <SignalCard
                key={stock.symbol} symbol={stock.symbol}
                quote={stock.quote} signal={stock.signal}
                liquidity={optionsLiquidity[stock.symbol]}
                quantRank={stock.quantRank} quantScore={stock.quantScore}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Cold ─────────────────────────────────────────── */}
      {cold.length > 0 && (
        <Section title="Cold" subtitle="Score < 40">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cold.map((stock) => (
              <SignalCard
                key={stock.symbol} symbol={stock.symbol}
                quote={stock.quote} signal={stock.signal}
                liquidity={optionsLiquidity[stock.symbol]}
                quantRank={stock.quantRank} quantScore={stock.quantScore}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="font-display font-semibold text-text-primary">{title}</h3>
        <span className="text-xs text-text-muted font-mono">{subtitle}</span>
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string; value: string; icon: React.ReactNode;
  color: "green" | "red" | "amber" | "blue";
}) {
  const colors = {
    green: "text-accent-green bg-accent-green-dim border-accent-green/20",
    red: "text-accent-red bg-accent-red-dim border-accent-red/20",
    amber: "text-accent-amber bg-accent-amber-dim border-accent-amber/20",
    blue: "text-accent-blue bg-accent-blue-dim border-accent-blue/20",
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono font-bold text-xl">{value}</div>
    </div>
  );
}
