"use client";

import { CompositeSignal, Quote, LiquidityGrade } from "@/lib/types";
import { useStore } from "@/lib/store";
import { TrendingUp, TrendingDown, Activity, BarChart2, Zap, Globe, ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  symbol: string;
  quote?: Quote;
  signal?: CompositeSignal;
  liquidity?: LiquidityGrade;
  quantRank?: number;
  quantScore?: number;
  onClick?: () => void;
}

const signalIcons: Record<string, any> = {
  VWAP_RECLAIM: Activity,
  RSI_MOMENTUM: TrendingUp,
  EMA_CROSS: Zap,
  VOLUME_SURGE: BarChart2,
  PRICE_ACTION: TrendingDown,
  MARKET_ALIGNMENT: Globe,
};

const liqStyles: Record<string, { text: string; bg: string; label: string }> = {
  HIGH: { text: "text-accent-green", bg: "bg-accent-green-dim", label: "OPT: HIGH" },
  MEDIUM: { text: "text-accent-amber", bg: "bg-accent-amber-dim", label: "OPT: MED" },
  LOW: { text: "text-accent-red", bg: "bg-accent-red-dim", label: "OPT: LOW" },
  NONE: { text: "text-text-muted", bg: "bg-bg-hover", label: "NO OPTIONS" },
};

export default function SignalCard({ symbol, quote, signal, liquidity, quantRank, quantScore, onClick }: Props) {
  const { startingBalance } = useStore();
  const score = signal?.score || 0;
  const direction = signal?.direction || "NEUTRAL";
  const confidence = signal?.confidence || "LOW";

  const scoreColor =
    score >= 70 ? "text-accent-green" : score >= 40 ? "text-accent-amber" : "text-text-muted";
  const scoreBg =
    score >= 70 ? "bg-accent-green-dim" : score >= 40 ? "bg-accent-amber-dim" : "bg-bg-hover";
  const changeColor =
    (quote?.changePercent || 0) >= 0 ? "text-accent-green" : "text-accent-red";
  const dirColor = direction === "LONG" ? "text-accent-green" : direction === "SHORT" ? "text-accent-red" : "text-text-muted";
  const dirBg = direction === "LONG" ? "bg-accent-green-dim" : direction === "SHORT" ? "bg-accent-red-dim" : "bg-bg-hover";
  const DirIcon = direction === "LONG" ? ArrowUp : direction === "SHORT" ? ArrowDown : Activity;

  // Position sizing estimate (rough: assume contract ~$1.50 for display)
  const estContractCost = quote ? Math.max(quote.price * 0.015, 0.50) * 100 : 150;
  const maxContracts = Math.floor(startingBalance * 0.3 / estContractCost);
  const riskPct = estContractCost > 0 ? ((estContractCost / startingBalance) * 100).toFixed(0) : "?";

  return (
    <div
      onClick={onClick}
      className="group bg-bg-card border border-bg-border rounded-xl p-4 hover:border-accent-green/30 transition-all cursor-pointer animate-fade-in"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono font-bold text-text-primary text-base">{symbol}</h3>
            {quantRank && (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent-blue-dim text-accent-blue">
                #{quantRank}
              </span>
            )}
          </div>
          {quote && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-sm text-text-primary">
                ${quote.price.toFixed(2)}
              </span>
              <span className={`font-mono text-xs ${changeColor}`}>
                {quote.changePercent >= 0 ? "+" : ""}
                {quote.changePercent.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Score + Direction badge */}
        <div className="flex flex-col items-end gap-1">
          <div className={`${scoreBg} ${scoreColor} rounded-lg px-3 py-1 font-mono font-bold text-lg min-w-[56px] text-center`}>
            {score}
          </div>
          {direction !== "NEUTRAL" && (
            <div className={`${dirBg} ${dirColor} rounded px-2 py-0.5 flex items-center gap-1 text-[10px] font-mono font-bold`}>
              <DirIcon className="w-3 h-3" />
              {direction === "LONG" ? "CALL" : "PUT"}
            </div>
          )}
        </div>
      </div>

      {/* Confidence bar */}
      {direction !== "NEUTRAL" && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-mono text-text-muted uppercase">Confidence</span>
          <div className="flex gap-0.5">
            {["LOW", "MEDIUM", "HIGH", "VERY_HIGH"].map((level, i) => (
              <div
                key={level}
                className={`h-1.5 w-4 rounded-sm ${
                  ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"].indexOf(confidence) >= i
                    ? direction === "LONG" ? "bg-accent-green" : "bg-accent-red"
                    : "bg-bg-hover"
                }`}
              />
            ))}
          </div>
          <span className={`text-[9px] font-mono ${dirColor}`}>{confidence.replace("_", " ")}</span>
        </div>
      )}

      {/* Signal indicators */}
      {signal && signal.signals.length > 0 && (
        <div className="space-y-1">
          {signal.signals.map((s) => {
            const Icon = signalIcons[s.type] || Activity;
            const activeColor = s.bullish ? "text-accent-green" : "text-accent-red";
            const barColor = s.bullish ? "bg-accent-green" : "bg-accent-red";
            return (
              <div key={s.type} className="flex items-center gap-2">
                <Icon className={`w-3 h-3 flex-shrink-0 ${s.active ? activeColor : "text-text-muted"}`} />
                <span className={`text-xs font-mono truncate ${s.active ? "text-text-primary" : "text-text-muted"}`}>
                  {s.name}
                </span>
                <div className="flex-1 h-1 bg-bg-hover rounded-full ml-auto min-w-[40px] max-w-[60px]">
                  <div
                    className={`h-full rounded-full transition-all ${s.active ? barColor : "bg-text-muted/30"}`}
                    style={{ width: `${s.score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer: position sizing + options liquidity */}
      <div className="mt-3 pt-2 border-t border-bg-border flex items-center justify-between text-[10px] font-mono">
        {direction !== "NEUTRAL" && (
          <span className="text-text-muted">
            ~{maxContracts} contract{maxContracts !== 1 ? "s" : ""} ({riskPct}% risk)
          </span>
        )}
        {quote && direction === "NEUTRAL" && (
          <span className="text-text-muted">Vol {(quote.volume / 1_000_000).toFixed(1)}M</span>
        )}
        {liquidity && (
          <span className={`font-bold px-1.5 py-0.5 rounded ${liqStyles[liquidity].bg} ${liqStyles[liquidity].text}`}>
            {liqStyles[liquidity].label}
          </span>
        )}
      </div>
    </div>
  );
}
