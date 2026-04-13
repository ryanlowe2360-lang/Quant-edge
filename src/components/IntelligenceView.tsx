"use client";

import { useState, useCallback, useEffect } from "react";
import { useStore } from "@/lib/store";
import {
  Brain,
  Globe,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Layers,
  Target,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { RegimeInfo, KeyLevels } from "@/lib/regime";
import type { TimeframeBias } from "@/lib/multiframe";

interface IntelligenceData {
  regime: RegimeInfo;
  spy: any;
  mtf: Record<string, TimeframeBias>;
  levels: Record<string, KeyLevels>;
}

const regimeColors = {
  LOW_VOL_TREND: { bg: "bg-accent-green-dim", text: "text-accent-green", border: "border-accent-green/20", label: "LOW VOL TREND" },
  NORMAL: { bg: "bg-accent-blue-dim", text: "text-accent-blue", border: "border-accent-blue/20", label: "NORMAL" },
  HIGH_VOL: { bg: "bg-accent-amber-dim", text: "text-accent-amber", border: "border-accent-amber/20", label: "HIGH VOLATILITY" },
  CRISIS: { bg: "bg-accent-red-dim", text: "text-accent-red", border: "border-accent-red/20", label: "CRISIS" },
};

const alignColors = {
  STRONG_BULL: "text-accent-green bg-accent-green-dim",
  BULL: "text-accent-green bg-accent-green-dim/50",
  NEUTRAL: "text-text-muted bg-bg-hover",
  BEAR: "text-accent-red bg-accent-red-dim/50",
  STRONG_BEAR: "text-accent-red bg-accent-red-dim",
};

export default function IntelligenceView() {
  const { watchlist, signals, signalThreshold } = useStore();
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [sentiment, setSentiment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const topSymbols = watchlist
    .filter((s) => (signals[s.symbol]?.score || 0) >= 40)
    .sort((a, b) => (signals[b.symbol]?.score || 0) - (signals[a.symbol]?.score || 0))
    .slice(0, 10)
    .map((s) => s.symbol);

  const fetchIntelligence = useCallback(async () => {
    setLoading(true);
    try {
      const syms = topSymbols.length > 0 ? topSymbols.join(",") : "";
      const url = syms ? `/api/intelligence?symbols=${syms}` : "/api/intelligence";
      const [intelRes, sentRes] = await Promise.all([
        fetch(url),
        fetch("/api/sentiment"),
      ]);
      if (intelRes.ok) {
        const d = await intelRes.json();
        setData(d);
      }
      if (sentRes.ok) {
        const s = await sentRes.json();
        setSentiment(s);
      }
    } catch (err) {
      console.error("Intelligence fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [topSymbols.join(",")]);

  useEffect(() => {
    fetchIntelligence();
    const timer = setInterval(fetchIntelligence, 120_000); // 2 min
    return () => clearInterval(timer);
  }, []);

  const regime = data?.regime;
  const rStyle = regime ? regimeColors[regime.regime] : regimeColors.NORMAL;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display font-bold text-text-primary text-lg">
            Market Intelligence
          </h2>
          <span className="text-xs font-mono text-text-muted bg-bg-card px-2 py-0.5 rounded-md border border-bg-border">
            Phase 5
          </span>
        </div>
        <button
          onClick={fetchIntelligence}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-card border border-bg-border text-text-secondary text-xs font-mono hover:border-accent-green/40 transition-all"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      {/* Market Regime Card */}
      <div className={`rounded-xl border p-5 ${rStyle.bg} ${rStyle.border}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Globe className={`w-5 h-5 ${rStyle.text}`} />
            <span className={`font-display font-bold text-lg ${rStyle.text}`}>
              {regime ? rStyle.label : "Loading..."}
            </span>
          </div>
          {regime && (
            <div className="flex items-center gap-4 text-sm font-mono">
              <span className={rStyle.text}>VIX ≈ {regime.vixLevel.toFixed(1)}</span>
              <span className={`${
                regime.spyTrend === "UP" ? "text-accent-green" : regime.spyTrend === "DOWN" ? "text-accent-red" : "text-text-muted"
              }`}>
                SPY {regime.spyTrend} {data?.spy?.changePercent ? `(${data.spy.changePercent >= 0 ? "+" : ""}${data.spy.changePercent.toFixed(2)}%)` : ""}
              </span>
            </div>
          )}
        </div>
        {regime && (
          <>
            <p className="text-sm text-text-secondary mb-3">{regime.description}</p>
            <div className="flex gap-4">
              <div className={`rounded-lg px-3 py-2 border ${rStyle.border}`}>
                <span className="text-[10px] font-mono text-text-muted block">Threshold Adjust</span>
                <span className={`font-mono font-bold ${rStyle.text}`}>
                  {regime.thresholdAdjustment > 0 ? "+" : ""}{regime.thresholdAdjustment}
                </span>
                <span className="text-[10px] font-mono text-text-muted ml-1">
                  → {signalThreshold + regime.thresholdAdjustment}
                </span>
              </div>
              <div className={`rounded-lg px-3 py-2 border ${rStyle.border}`}>
                <span className="text-[10px] font-mono text-text-muted block">Risk Multiplier</span>
                <span className={`font-mono font-bold ${rStyle.text}`}>
                  {regime.riskMultiplier}x
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sentiment & Fear/Greed Card */}
      {sentiment && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-bg-card border border-bg-border rounded-xl p-5">
            <h3 className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">Fear & Greed Index</h3>
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-mono font-bold ${
                sentiment.fearGreedIndex >= 60 ? "text-accent-green" :
                sentiment.fearGreedIndex >= 40 ? "text-accent-amber" :
                "text-accent-red"
              }`}>
                {sentiment.fearGreedIndex}
              </div>
              <div>
                <div className={`text-sm font-mono font-bold ${
                  sentiment.marketMood?.includes("GREED") ? "text-accent-green" :
                  sentiment.marketMood === "NEUTRAL" ? "text-accent-amber" :
                  "text-accent-red"
                }`}>
                  {sentiment.fearGreedLabel}
                </div>
                <div className="text-xs text-text-secondary mt-1">{sentiment.tradingBias}</div>
              </div>
            </div>
            <div className="mt-3 h-2 bg-bg-hover rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  sentiment.fearGreedIndex >= 60 ? "bg-accent-green" :
                  sentiment.fearGreedIndex >= 40 ? "bg-accent-amber" :
                  "bg-accent-red"
                }`}
                style={{ width: `${sentiment.fearGreedIndex}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] font-mono text-accent-red">Extreme Fear</span>
              <span className="text-[10px] font-mono text-accent-green">Extreme Greed</span>
            </div>
          </div>

          <div className="bg-bg-card border border-bg-border rounded-xl p-5">
            <h3 className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">Market Headlines</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {sentiment.headlines && sentiment.headlines.length > 0 ? (
                sentiment.headlines.slice(0, 8).map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                      h.sentiment === "BULLISH" ? "bg-accent-green" :
                      h.sentiment === "BEARISH" ? "bg-accent-red" :
                      "bg-text-muted"
                    }`} />
                    <span className="text-text-secondary leading-snug">{h.title}</span>
                  </div>
                ))
              ) : (
                <p className="text-text-muted text-xs">No headlines available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multi-Timeframe Alignment Table */}
      {data?.mtf && Object.keys(data.mtf).length > 0 && (
        <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-bg-border flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-blue" />
            <h3 className="font-display font-semibold text-text-primary text-sm">
              Multi-Timeframe Alignment
            </h3>
            <span className="text-[10px] font-mono text-text-muted">Top {Object.keys(data.mtf).length} by signal score</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-bg-border">
                <th className="text-left px-5 py-2.5 text-[10px] font-mono uppercase text-text-muted">Symbol</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-mono uppercase text-text-muted">5m Signal</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-mono uppercase text-text-muted">Hourly</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-mono uppercase text-text-muted">Daily</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-mono uppercase text-text-muted">Alignment</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-mono uppercase text-text-muted">Confirmation</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-mono uppercase text-text-muted">Level Context</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.mtf).map(([sym, bias]) => {
                const levels = data.levels?.[sym];
                const signal = signals[sym];
                const isExpanded = expandedSymbol === sym;

                return (
                  <>
                    <tr
                      key={sym}
                      onClick={() => setExpandedSymbol(isExpanded ? null : sym)}
                      className="border-b border-bg-border/50 hover:bg-bg-hover/50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span className="font-mono font-bold text-text-primary">{sym}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-mono font-bold text-sm ${
                          (signal?.score || 0) >= signalThreshold ? "text-accent-green" : "text-text-muted"
                        }`}>
                          {signal?.score || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TrendBadge trend={bias.hourly.trend} rsi={bias.hourly.rsi} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TrendBadge trend={bias.daily.trend} rsi={bias.daily.rsi} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${alignColors[bias.alignment]}`}>
                          {bias.alignment.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-mono font-bold text-sm ${
                          bias.confirmationScore >= 70 ? "text-accent-green" : bias.confirmationScore >= 50 ? "text-accent-amber" : "text-accent-red"
                        }`}>
                          {bias.confirmationScore.toFixed(0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {levels && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            levels.currentVsLevels === "NEAR_SUPPORT" ? "bg-accent-green-dim text-accent-green" :
                            levels.currentVsLevels === "NEAR_RESISTANCE" ? "bg-accent-red-dim text-accent-red" :
                            levels.currentVsLevels === "ABOVE_ALL" ? "bg-accent-red-dim text-accent-red" :
                            "bg-bg-hover text-text-muted"
                          }`}>
                            {levels.currentVsLevels.replace("_", " ")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {isExpanded ? <ChevronDown className="w-3 h-3 text-text-muted" /> : <ChevronRight className="w-3 h-3 text-text-muted" />}
                      </td>
                    </tr>
                    {isExpanded && levels && (
                      <tr key={`${sym}-detail`} className="border-b border-bg-border/50">
                        <td colSpan={8} className="px-5 py-4 bg-bg-hover/30">
                          <LevelsDetail levels={levels} bias={bias} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!data && !loading && (
        <div className="bg-bg-card border border-bg-border rounded-xl p-12 text-center">
          <Brain className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <h3 className="font-display font-bold text-text-primary text-lg mb-2">
            Market Intelligence
          </h3>
          <p className="text-text-secondary text-sm max-w-lg mx-auto">
            Analyzes market regime (VIX), confirms signals against daily and hourly trends,
            and identifies key support/resistance levels. Add stocks to your watchlist to see analysis.
          </p>
        </div>
      )}
    </div>
  );
}

function TrendBadge({ trend, rsi }: { trend: string; rsi: number }) {
  const Icon = trend === "BULLISH" ? TrendingUp : trend === "BEARISH" ? TrendingDown : Minus;
  const color = trend === "BULLISH" ? "text-accent-green" : trend === "BEARISH" ? "text-accent-red" : "text-text-muted";

  return (
    <div className="flex items-center justify-center gap-1">
      <Icon className={`w-3 h-3 ${color}`} />
      <span className={`text-[10px] font-mono ${color}`}>{rsi.toFixed(0)}</span>
    </div>
  );
}

function LevelsDetail({ levels, bias }: { levels: KeyLevels; bias: TimeframeBias }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
      <LevelBox label="Prior Day High" value={levels.priorDayHigh} type="resistance" />
      <LevelBox label="Prior Day Low" value={levels.priorDayLow} type="support" />
      <LevelBox label="Pivot Point" value={levels.pivotPoint} type="neutral" />
      <LevelBox label="Prior VWAP" value={levels.priorDayVwap} type="neutral" />
      <LevelBox label="R1" value={levels.r1} type="resistance" />
      <LevelBox label="S1" value={levels.s1} type="support" />
      <LevelBox label="R2" value={levels.r2} type="resistance" />
      <LevelBox label="S2" value={levels.s2} type="support" />
      <LevelBox label="Today Open" value={levels.todayOpen} type="neutral" />
      <LevelBox label="Today High" value={levels.todayHigh} type="resistance" />
      <LevelBox label="Today Low" value={levels.todayLow} type="support" />
      <LevelBox label="Nearest Support" value={levels.nearestSupport} type="support" highlight />
    </div>
  );
}

function LevelBox({ label, value, type, highlight }: { label: string; value: number; type: "support" | "resistance" | "neutral"; highlight?: boolean }) {
  const colors = {
    support: "border-accent-green/20 text-accent-green",
    resistance: "border-accent-red/20 text-accent-red",
    neutral: "border-bg-border text-text-secondary",
  };

  return (
    <div className={`rounded-lg border p-2 ${highlight ? "bg-accent-green-dim/30 border-accent-green/30" : `bg-bg-card ${colors[type].split(" ")[0]}`}`}>
      <span className="text-[10px] font-mono text-text-muted block">{label}</span>
      <span className={`font-mono font-bold text-sm ${colors[type].split(" ")[1]}`}>
        ${value.toFixed(2)}
      </span>
    </div>
  );
}
