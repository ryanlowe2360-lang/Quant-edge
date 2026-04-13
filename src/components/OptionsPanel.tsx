"use client";

import { useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { OptionsRecommendation, OptionsContract } from "@/lib/types";
import {
  Layers,
  Search,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  DollarSign,
  Activity,
  ChevronDown,
  ChevronRight,
  Loader2,
  Zap,
} from "lucide-react";

const liquidityColors = {
  HIGH: { text: "text-accent-green", bg: "bg-accent-green-dim", label: "HIGH" },
  MEDIUM: { text: "text-accent-amber", bg: "bg-accent-amber-dim", label: "MED" },
  LOW: { text: "text-accent-red", bg: "bg-accent-red-dim", label: "LOW" },
  NONE: { text: "text-text-muted", bg: "bg-bg-hover", label: "NONE" },
};

export default function OptionsPanel() {
  const {
    watchlist,
    quotes,
    signals,
    optionsLiquidity,
    optionsRecs,
    setOptionsRec,
    optionsSettings,
    signalThreshold,
  } = useStore();

  const [loading, setLoading] = useState<string | null>(null);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [chainData, setChainData] = useState<Record<string, OptionsContract[]>>({});

  // Sort: hot signals first, then by liquidity, then alphabetical
  const sorted = [...watchlist].sort((a, b) => {
    const scoreA = signals[a.symbol]?.score || 0;
    const scoreB = signals[b.symbol]?.score || 0;
    if (scoreA >= signalThreshold && scoreB < signalThreshold) return -1;
    if (scoreB >= signalThreshold && scoreA < signalThreshold) return 1;
    return scoreB - scoreA;
  });

  const hotSymbols = sorted.filter(
    (s) => (signals[s.symbol]?.score || 0) >= signalThreshold
  );

  // Fetch full recommendation for a single symbol
  const fetchRecommendation = useCallback(
    async (symbol: string) => {
      setLoading(symbol);
      try {
        const price = quotes[symbol]?.price || 0;
        const budget = optionsSettings.maxBudgetPerTrade;
        const res = await fetch(
          `/api/options?symbol=${symbol}&price=${price}&budget=${budget}`
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (data.recommendation) {
          setOptionsRec(symbol, data.recommendation);
        }
        if (data.chain) {
          setChainData((prev) => ({ ...prev, [symbol]: data.chain }));
        }
        setExpandedSymbol(symbol);
      } catch (err) {
        console.error("Options fetch error:", err);
      } finally {
        setLoading(null);
      }
    },
    [quotes, optionsSettings, setOptionsRec]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-display font-bold text-text-primary text-lg">
            Options Intelligence
          </h2>
          <span className="text-xs font-mono text-text-muted bg-bg-card px-2 py-0.5 rounded-md border border-bg-border">
            Phase 2
          </span>
        </div>
      </div>

      {/* Hot signals with options callout */}
      {hotSymbols.length > 0 && (
        <div className="bg-accent-green-dim border border-accent-green/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-accent-green" />
            <span className="font-display font-semibold text-accent-green text-sm">
              Active Signals — Check Options
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {hotSymbols.map((s) => {
              const liq = optionsLiquidity[s.symbol] || "NONE";
              const liqStyle = liquidityColors[liq];
              return (
                <button
                  key={s.symbol}
                  onClick={() => fetchRecommendation(s.symbol)}
                  disabled={loading === s.symbol}
                  className="flex items-center gap-2 px-3 py-2 bg-bg-card border border-bg-border rounded-lg hover:border-accent-green/40 transition-all text-sm"
                >
                  <span className="font-mono font-bold text-text-primary">
                    {s.symbol}
                  </span>
                  <span className="font-mono text-xs text-accent-green">
                    {signals[s.symbol]?.score || 0}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${liqStyle.bg} ${liqStyle.text}`}
                  >
                    {liqStyle.label}
                  </span>
                  {loading === s.symbol && (
                    <Loader2 className="w-3 h-3 animate-spin text-accent-green" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Liquidity Overview Table */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-bg-border">
          <h3 className="font-display font-semibold text-text-primary text-sm">
            Watchlist Options Liquidity
          </h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="text-left px-5 py-2.5 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Symbol
              </th>
              <th className="text-right px-5 py-2.5 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Price
              </th>
              <th className="text-right px-5 py-2.5 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Signal
              </th>
              <th className="text-center px-5 py-2.5 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Options Liq.
              </th>
              <th className="text-center px-5 py-2.5 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Recommendation
              </th>
              <th className="w-12 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((stock) => {
              const q = quotes[stock.symbol];
              const sig = signals[stock.symbol];
              const liq = optionsLiquidity[stock.symbol] || "NONE";
              const liqStyle = liquidityColors[liq];
              const rec = optionsRecs[stock.symbol];
              const isExpanded = expandedSymbol === stock.symbol;
              const isHot = (sig?.score || 0) >= signalThreshold;

              return (
                <TableRowWithDetail
                  key={stock.symbol}
                  symbol={stock.symbol}
                  price={q?.price}
                  changePercent={q?.changePercent}
                  signalScore={sig?.score || 0}
                  isHot={isHot}
                  liqStyle={liqStyle}
                  liq={liq}
                  rec={rec}
                  isExpanded={isExpanded}
                  isLoading={loading === stock.symbol}
                  chain={chainData[stock.symbol] || []}
                  onToggle={() => {
                    if (isExpanded) {
                      setExpandedSymbol(null);
                    } else {
                      fetchRecommendation(stock.symbol);
                    }
                  }}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {watchlist.length === 0 && (
        <div className="bg-bg-card border border-bg-border rounded-xl p-12 text-center">
          <Layers className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <h3 className="font-display font-bold text-text-primary text-lg mb-2">
            No stocks on your watchlist
          </h3>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Add tickers to your watchlist first, then the options scanner will
            grade their liquidity and recommend contracts when signals fire.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Table Row with expandable detail ──
function TableRowWithDetail({
  symbol,
  price,
  changePercent,
  signalScore,
  isHot,
  liqStyle,
  liq,
  rec,
  isExpanded,
  isLoading,
  chain,
  onToggle,
}: {
  symbol: string;
  price?: number;
  changePercent?: number;
  signalScore: number;
  isHot: boolean;
  liqStyle: any;
  liq: string;
  rec?: OptionsRecommendation;
  isExpanded: boolean;
  isLoading: boolean;
  chain: OptionsContract[];
  onToggle: () => void;
}) {
  const changeColor = (changePercent || 0) >= 0 ? "text-accent-green" : "text-accent-red";
  const scoreColor =
    signalScore >= 70
      ? "text-accent-green bg-accent-green-dim"
      : signalScore >= 40
        ? "text-accent-amber bg-accent-amber-dim"
        : "text-text-muted bg-bg-hover";

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-bg-border/50 hover:bg-bg-hover/50 transition-colors cursor-pointer ${
          isHot ? "bg-accent-green-dim/20" : ""
        }`}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-text-muted" />
            ) : (
              <ChevronRight className="w-3 h-3 text-text-muted" />
            )}
            <span className="font-mono font-bold text-text-primary text-sm">
              {symbol}
            </span>
          </div>
        </td>
        <td className="px-5 py-3 text-right">
          <span className="font-mono text-sm text-text-primary">
            {price ? `$${price.toFixed(2)}` : "—"}
          </span>
        </td>
        <td className="px-5 py-3 text-right">
          <span className={`inline-block font-mono text-xs font-bold rounded-md px-2 py-0.5 ${scoreColor}`}>
            {signalScore}
          </span>
        </td>
        <td className="px-5 py-3 text-center">
          <span className={`inline-block font-mono text-[10px] font-bold rounded-md px-2 py-0.5 ${liqStyle.bg} ${liqStyle.text}`}>
            {liqStyle.label}
          </span>
        </td>
        <td className="px-5 py-3 text-center">
          {rec?.bestContract ? (
            <span className="text-xs font-mono text-accent-green">
              ${rec.bestContract.strike} {rec.bestContract.type} @ ${rec.bestContract.ask.toFixed(2)}
            </span>
          ) : rec ? (
            <span className="text-xs font-mono text-text-muted">No viable contract</span>
          ) : (
            <span className="text-xs font-mono text-text-muted">Click to scan</span>
          )}
        </td>
        <td className="px-3 py-3">
          {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-green" />}
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && rec && (
        <tr className="border-b border-bg-border/50">
          <td colSpan={6} className="px-5 py-4 bg-bg-hover/30">
            <RecommendationDetail rec={rec} chain={chain} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Recommendation Detail Panel ──
function RecommendationDetail({
  rec,
  chain,
}: {
  rec: OptionsRecommendation;
  chain: OptionsContract[];
}) {
  const [showChain, setShowChain] = useState(false);
  const liqStyle = liquidityColors[rec.liquidityGrade];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary bar */}
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-lg ${liqStyle.bg}`}>
          {rec.bestContract ? (
            <CheckCircle2 className={`w-5 h-5 ${liqStyle.text}`} />
          ) : (
            <XCircle className="w-5 h-5 text-text-muted" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm text-text-primary leading-relaxed">{rec.reason}</p>
        </div>
      </div>

      {/* Best Contract Card */}
      {rec.bestContract && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniCard
            label="Contract"
            value={`$${rec.bestContract.strike} ${rec.bestContract.type}`}
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            color="green"
          />
          <MiniCard
            label="Cost (1 contract)"
            value={`$${rec.estimatedCost.toFixed(0)}`}
            icon={<DollarSign className="w-3.5 h-3.5" />}
            color="blue"
          />
          <MiniCard
            label="Spread Cost"
            value={`$${rec.spreadCost.toFixed(0)} (${rec.bestContract.spreadPercent.toFixed(1)}%)`}
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            color={rec.bestContract.spreadPercent > 10 ? "amber" : "green"}
          />
          <MiniCard
            label="Max Risk"
            value={`$${rec.maxRisk.toFixed(0)}`}
            icon={<Activity className="w-3.5 h-3.5" />}
            color="red"
          />
        </div>
      )}

      {/* Greeks */}
      {rec.bestContract && (
        <div className="bg-bg-card border border-bg-border rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
            Greeks & Details
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <GreekItem label="Delta" value={rec.bestContract.delta.toFixed(3)} />
            <GreekItem label="IV" value={`${(rec.bestContract.impliedVolatility * 100).toFixed(1)}%`} />
            <GreekItem label="Bid" value={`$${rec.bestContract.bid.toFixed(2)}`} />
            <GreekItem label="Ask" value={`$${rec.bestContract.ask.toFixed(2)}`} />
            <GreekItem label="Volume" value={rec.bestContract.volume.toLocaleString()} />
            <GreekItem label="Open Int" value={rec.bestContract.openInterest.toLocaleString()} />
          </div>
        </div>
      )}

      {/* Alternatives */}
      {rec.alternatives.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
            Alternative Contracts
          </div>
          <div className="space-y-1">
            {rec.alternatives.map((alt, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 bg-bg-card border border-bg-border rounded-lg text-xs font-mono"
              >
                <span className="text-text-primary">
                  ${alt.strike} {alt.type} ({alt.expiry})
                </span>
                <div className="flex items-center gap-4 text-text-secondary">
                  <span>Ask: ${alt.ask.toFixed(2)}</span>
                  <span>OI: {alt.openInterest}</span>
                  <span>Δ {Math.abs(alt.delta).toFixed(2)}</span>
                  <span>Spread: {alt.spreadPercent.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Chain Toggle */}
      {chain.length > 0 && (
        <div>
          <button
            onClick={() => setShowChain(!showChain)}
            className="flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-accent-green transition-colors"
          >
            {showChain ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {showChain ? "Hide" : "Show"} Full Chain ({chain.length} contracts)
          </button>

          {showChain && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-bg-border">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-bg-card">
                  <tr className="border-b border-bg-border">
                    <th className="text-left px-3 py-2 text-text-muted">Strike</th>
                    <th className="text-left px-3 py-2 text-text-muted">Type</th>
                    <th className="text-left px-3 py-2 text-text-muted">Expiry</th>
                    <th className="text-right px-3 py-2 text-text-muted">Bid</th>
                    <th className="text-right px-3 py-2 text-text-muted">Ask</th>
                    <th className="text-right px-3 py-2 text-text-muted">Vol</th>
                    <th className="text-right px-3 py-2 text-text-muted">OI</th>
                    <th className="text-right px-3 py-2 text-text-muted">Delta</th>
                    <th className="text-right px-3 py-2 text-text-muted">Spread%</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.map((c, i) => {
                    const isGood =
                      c.openInterest >= 50 && c.spreadPercent < 20 && c.bid > 0;
                    return (
                      <tr
                        key={i}
                        className={`border-b border-bg-border/30 ${
                          isGood ? "text-text-primary" : "text-text-muted opacity-50"
                        }`}
                      >
                        <td className="px-3 py-1.5">${c.strike}</td>
                        <td className="px-3 py-1.5">{c.type}</td>
                        <td className="px-3 py-1.5">{c.expiry}</td>
                        <td className="px-3 py-1.5 text-right">${c.bid.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right">${c.ask.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right">{c.volume}</td>
                        <td className="px-3 py-1.5 text-right">{c.openInterest}</td>
                        <td className="px-3 py-1.5 text-right">{c.delta.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <span
                            className={
                              c.spreadPercent > 20
                                ? "text-accent-red"
                                : c.spreadPercent > 10
                                  ? "text-accent-amber"
                                  : "text-accent-green"
                            }
                          >
                            {c.spreadPercent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: "green" | "red" | "amber" | "blue";
}) {
  const colors = {
    green: "text-accent-green bg-accent-green-dim border-accent-green/20",
    red: "text-accent-red bg-accent-red-dim border-accent-red/20",
    amber: "text-accent-amber bg-accent-amber-dim border-accent-amber/20",
    blue: "text-accent-blue bg-accent-blue-dim border-accent-blue/20",
  };

  return (
    <div className={`rounded-lg border p-2.5 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono font-bold text-sm">{value}</div>
    </div>
  );
}

function GreekItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-mono text-text-muted uppercase">{label}</div>
      <div className="font-mono font-medium text-text-primary text-sm">{value}</div>
    </div>
  );
}
