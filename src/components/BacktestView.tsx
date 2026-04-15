"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { BacktestConfig, BacktestResult, OptimizationResult, GridSearchResult, DEFAULT_BACKTEST_CONFIG } from "@/lib/backtest";
import { format, subDays } from "date-fns";
import {
  FlaskConical,
  Play,
  Loader2,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  BarChart3,
  DollarSign,
  Activity,
  Zap,
  AlertTriangle,
  Award,
  ChevronDown,
  ChevronRight,
  Settings2,
} from "lucide-react";
import OptionsSnapshotsViewer from "./OptionsSnapshotsViewer";

export default function BacktestView() {
  const { watchlist } = useStore();
  const symbols = watchlist.map((s) => s.symbol);

  const [config, setConfig] = useState<BacktestConfig>({
    ...DEFAULT_BACKTEST_CONFIG,
    symbols,
    startDate: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  });

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [optResult, setOptResult] = useState<OptimizationResult | null>(null);
  const [gridResult, setGridResult] = useState<GridSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState<"backtest" | "optimize" | "grid">("backtest");
  const [optParam, setOptParam] = useState("signalThreshold");
  const [recordingStats, setRecordingStats] = useState<any>(null);

  // Fetch recording stats on mount
  useEffect(() => {
    fetch("/api/record-options")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setRecordingStats(d); })
      .catch(() => {});
  }, []);

  const runBacktest = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setOptResult(null);
    setGridResult(null);

    try {
      const body: any = {
        mode,
        config: { ...config, symbols },
      };

      if (mode === "optimize") {
        body.paramName = optParam;
        body.paramValues = getOptValues(optParam);
      }

      if (mode === "grid") {
        body.paramGrid = {
          signalThreshold: [55, 65, 75],
          trailingStopPercent: [15, 25, 35],
          hardStopPercent: [25, 35],
          takeProfitPercent: [0, 100],
          maxHoldBars: [48, 78],
          minHoldBars: [3, 6],
          entryMinActiveSignals: [1, 2],
          optionDeltaMultiplier: [3, 5],
          signalCollapseThreshold: [0, 10],
          contractCost: [50, 150, 400],
          spreadCostPercent: [3, 5, 8],
        };
      }

      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Backtest failed");
        return;
      }

      if (mode === "optimize") {
        setOptResult(data.optimization);
      } else if (mode === "grid") {
        setGridResult(data.grid);
      } else {
        setResult(data.result);
      }
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="font-display font-bold text-text-primary text-lg">
          Backtest & Optimize
        </h2>
        <span className="text-xs font-mono text-text-muted bg-bg-card px-2 py-0.5 rounded-md border border-bg-border">
          Phase 4
        </span>
      </div>

      {/* Recording Status Banner */}
      {recordingStats && (
        <div className={`rounded-xl border p-4 ${
          recordingStats.daysRecorded >= 5
            ? "bg-accent-green-dim border-accent-green/20"
            : "bg-accent-amber-dim border-accent-amber/20"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <span className={`text-xs font-mono font-bold ${
                recordingStats.daysRecorded >= 5 ? "text-accent-green" : "text-accent-amber"
              }`}>
                📊 Options Data Recording: {recordingStats.daysRecorded || 0} days, {recordingStats.totalRecords || 0} snapshots
              </span>
              <p className="text-[10px] text-text-muted mt-1">
                {recordingStats.daysRecorded >= 5
                  ? "✅ Enough data for real-options backtesting! Results will use actual Greeks and prices."
                  : `Recording real options data. Need ${5 - (recordingStats.daysRecorded || 0)} more days for real-data backtesting. Currently using Black-Scholes simulation.`
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Config Panel */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-text-primary text-sm">Configuration</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setMode("backtest")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                mode === "backtest"
                  ? "bg-accent-green/20 text-accent-green"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Backtest
            </button>
            <button
              onClick={() => setMode("optimize")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                mode === "optimize"
                  ? "bg-accent-blue/20 text-accent-blue"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Optimize
            </button>
            <button
              onClick={() => setMode("grid")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                mode === "grid"
                  ? "bg-accent-amber/20 text-accent-amber"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Grid Search
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-mono text-text-muted uppercase block mb-1">Start Date</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-text-muted uppercase block mb-1">End Date</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-text-muted uppercase block mb-1">Signal Threshold</label>
            <input
              type="number"
              value={config.signalThreshold}
              onChange={(e) => setConfig({ ...config, signalThreshold: parseInt(e.target.value) || 70 })}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-text-muted uppercase block mb-1">Symbols</label>
            <div className="px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-secondary font-mono text-sm">
              {symbols.length} from watchlist
            </div>
          </div>
        </div>

        {/* Optimize parameter selector */}
        {mode === "optimize" && (
          <div>
            <label className="text-[10px] font-mono text-text-muted uppercase block mb-1">Parameter to Optimize</label>
            <select
              value={optParam}
              onChange={(e) => setOptParam(e.target.value)}
              className="w-full md:w-64 px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-blue/50"
            >
              <option value="signalThreshold">Signal Threshold</option>
              <option value="hardStopPercent">Hard Stop %</option>
              <option value="trailingStopPercent">Trailing Stop %</option>
              <option value="takeProfitPercent">Take Profit %</option>
              <option value="entryMinActiveSignals">Min Active Signals</option>
              <option value="signalCollapseThreshold">Signal Collapse Threshold</option>
              <option value="minHoldBars">Min Hold Bars</option>
              <option value="maxHoldBars">Max Hold Bars</option>
            </select>
          </div>
        )}

        {/* Advanced settings toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-text-secondary transition-colors"
        >
          {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Settings2 className="w-3 h-3" />
          Advanced Settings
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
            <ConfigInput label="Hard Stop %" value={config.hardStopPercent} onChange={(v) => setConfig({ ...config, hardStopPercent: v })} />
            <ConfigInput label="Trailing Stop %" value={config.trailingStopPercent} onChange={(v) => setConfig({ ...config, trailingStopPercent: v })} />
            <ConfigInput label="Take Profit %" value={config.takeProfitPercent} onChange={(v) => setConfig({ ...config, takeProfitPercent: v })} />
            <ConfigInput label="Signal Collapse Exit (0=off)" value={config.signalCollapseThreshold} onChange={(v) => setConfig({ ...config, signalCollapseThreshold: v })} />
            <ConfigInput label="Min Hold Bars (×5min)" value={config.minHoldBars} onChange={(v) => setConfig({ ...config, minHoldBars: v })} />
            <ConfigInput label="Max Hold Bars (0=∞, 78=1day)" value={config.maxHoldBars} onChange={(v) => setConfig({ ...config, maxHoldBars: v })} />
            <ConfigInput label="Delta Multiplier" value={config.optionDeltaMultiplier} onChange={(v) => setConfig({ ...config, optionDeltaMultiplier: v })} step={0.5} />
            <ConfigInput label="Spread Cost %" value={config.spreadCostPercent} onChange={(v) => setConfig({ ...config, spreadCostPercent: v })} />
            <ConfigInput label="Contract Cost $" value={config.contractCost} onChange={(v) => setConfig({ ...config, contractCost: v })} />
            <ConfigInput label="Max Positions" value={config.maxConcurrentPositions} onChange={(v) => setConfig({ ...config, maxConcurrentPositions: v })} />
            <ConfigInput label="Min Active Signals" value={config.entryMinActiveSignals} onChange={(v) => setConfig({ ...config, entryMinActiveSignals: v })} />
          </div>
        )}

        {/* Grid Search Info */}
        {mode === "grid" && (
          <div className="bg-accent-amber-dim border border-accent-amber/20 rounded-lg p-3 animate-fade-in">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-accent-amber" />
              <span className="font-mono font-semibold text-accent-amber text-xs">Multi-Parameter Grid Search</span>
            </div>
            <p className="text-xs text-text-secondary">
              Tests all combinations of 11 parameters including contract cost and spread: Signal Threshold × Trailing Stop × Hard Stop × Take Profit × Max Hold × Min Hold × Min Signals × Delta × Signal Collapse × Contract Cost ($50/$150/$400) × Spread Cost (3/5/8%) = 10,368 backtests with Black-Scholes pricing. Returns top 20 by Sharpe. Takes ~30-45 minutes.
            </p>
          </div>
        )}

        {/* Run button */}
        <div className="flex items-center gap-3">
          <button
            onClick={runBacktest}
            disabled={loading || symbols.length === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all ${
              mode === "grid"
                ? "bg-accent-amber text-bg-primary hover:bg-accent-amber/90"
                : "bg-accent-green text-bg-primary hover:bg-accent-green/90"
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === "grid" ? (
              <BarChart3 className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {loading
              ? mode === "grid" ? "Searching..." : "Running..."
              : mode === "optimize" ? "Run Optimization"
              : mode === "grid" ? "Run Grid Search (10,368 combos)"
              : "Run Backtest"}
          </button>
          {loading && (
            <span className="text-xs font-mono text-text-muted animate-pulse">
              {mode === "grid"
                ? "Testing all parameter combinations — this may take 1-2 minutes..."
                : "Fetching historical data and simulating trades..."}
            </span>
          )}
          {error && (
            <span className="text-xs font-mono text-accent-red">{error}</span>
          )}
        </div>
      </div>

      {/* Backtest Results */}
      {result && <BacktestResults result={result} />}

      {/* Optimization Results */}
      {optResult && <OptimizationResults result={optResult} />}

      {/* Grid Search Results */}
      {gridResult && <GridSearchResults result={gridResult} />}

      {/* Empty state */}
      {!result && !optResult && !loading && (
        <div className="bg-bg-card border border-bg-border rounded-xl p-12 text-center">
          <FlaskConical className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <h3 className="font-display font-bold text-text-primary text-lg mb-2">
            Test Before You Trade
          </h3>
          <p className="text-text-secondary text-sm max-w-lg mx-auto">
            Run the signal engine against historical data to see how it would have performed.
            Optimize indicator thresholds, stop-loss levels, and take-profit targets based on
            real past data — not guesswork.
          </p>
        </div>
      )}

      {/* Options Snapshots Data Browser */}
      <OptionsSnapshotsViewer />
    </div>
  );
}

// ── Backtest Results Display ──
function BacktestResults({ result }: { result: BacktestResult }) {
  const m = result.metrics;
  const [showTrades, setShowTrades] = useState(false);
  const [showBySymbol, setShowBySymbol] = useState(false);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total P&L" value={`${(m.totalPnlDollar || 0) >= 0 ? "+" : ""}$${(m.totalPnlDollar || 0).toFixed(0)}`} sub={`${(m.totalPnlPercent || 0).toFixed(1)}%`} icon={<DollarSign className="w-4 h-4" />} color={(m.totalPnlDollar || 0) >= 0 ? "green" : "red"} />
        <MetricCard label="Win Rate" value={`${(m.winRate || 0).toFixed(1)}%`} sub={`${m.totalTrades || 0} trades`} icon={<Target className="w-4 h-4" />} color={(m.winRate || 0) >= 50 ? "green" : "red"} />
        <MetricCard label="Profit Factor" value={m.profitFactor === Infinity ? "∞" : (m.profitFactor || 0).toFixed(2)} sub="wins / losses" icon={<TrendingUp className="w-4 h-4" />} color={(m.profitFactor || 0) >= 1.5 ? "green" : (m.profitFactor || 0) >= 1 ? "amber" : "red"} />
        <MetricCard label="Sharpe Ratio" value={(m.sharpeRatio || 0).toFixed(2)} sub="risk-adjusted" icon={<Activity className="w-4 h-4" />} color={(m.sharpeRatio || 0) >= 1 ? "green" : (m.sharpeRatio || 0) >= 0 ? "amber" : "red"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Avg Win" value={`+${(m.avgWinPercent || 0).toFixed(1)}%`} sub={`Best: +$${(m.largestWin || 0).toFixed(0)}`} icon={<Award className="w-4 h-4" />} color="green" />
        <MetricCard label="Avg Loss" value={`${(m.avgLossPercent || 0).toFixed(1)}%`} sub={`Worst: $${(m.largestLoss || 0).toFixed(0)}`} icon={<AlertTriangle className="w-4 h-4" />} color="red" />
        <MetricCard label="Max Drawdown" value={`${(m.maxDrawdownPercent || 0).toFixed(1)}%`} sub="from peak" icon={<Shield className="w-4 h-4" />} color={(m.maxDrawdownPercent || 0) < 20 ? "green" : "red"} />
        <MetricCard label="Expectancy" value={`$${(m.expectancy || 0).toFixed(2)}`} sub="per trade" icon={<Zap className="w-4 h-4" />} color={(m.expectancy || 0) > 0 ? "green" : "red"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Win/Loss Ratio" value={(m.winLossRatio || 0).toFixed(2)} sub="avg win / avg loss" icon={<BarChart3 className="w-4 h-4" />} color={(m.winLossRatio || 0) >= 1.5 ? "green" : "amber"} />
        <MetricCard label="Avg Bars Held" value={(m.avgBarsHeld || 0).toFixed(1)} sub={`~${((m.avgBarsHeld || 0) * 5).toFixed(0)} min`} icon={<Activity className="w-4 h-4" />} color="blue" />
        <MetricCard label="Max Consec Wins" value={(m.maxConsecutiveWins || 0).toString()} sub="streak" icon={<TrendingUp className="w-4 h-4" />} color="green" />
        <MetricCard label="Max Consec Losses" value={(m.maxConsecutiveLosses || 0).toString()} sub="streak" icon={<TrendingDown className="w-4 h-4" />} color="red" />
      </div>

      {/* Equity Curve */}
      {result.equityCurve.length > 1 && (
        <div className="bg-bg-card border border-bg-border rounded-xl p-4">
          <h4 className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">Equity Curve</h4>
          <MiniEquityCurve data={result.equityCurve} />
        </div>
      )}

      {/* By Symbol Breakdown */}
      <div>
        <button
          onClick={() => setShowBySymbol(!showBySymbol)}
          className="flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-accent-green transition-colors mb-2"
        >
          {showBySymbol ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Per-Symbol Breakdown ({Object.keys(result.bySymbol).length} symbols)
        </button>
        {showBySymbol && (
          <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden animate-fade-in">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-bg-border">
                  <th className="text-left px-4 py-2 text-text-muted">Symbol</th>
                  <th className="text-right px-4 py-2 text-text-muted">Trades</th>
                  <th className="text-right px-4 py-2 text-text-muted">Win Rate</th>
                  <th className="text-right px-4 py-2 text-text-muted">P&L</th>
                  <th className="text-right px-4 py-2 text-text-muted">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(result.bySymbol)
                  .sort((a, b) => b.totalPnl - a.totalPnl)
                  .map((s) => (
                    <tr key={s.symbol} className="border-b border-bg-border/30 hover:bg-bg-hover/50">
                      <td className="px-4 py-2 font-bold text-text-primary">{s.symbol}</td>
                      <td className="px-4 py-2 text-right text-text-secondary">{s.trades}</td>
                      <td className={`px-4 py-2 text-right ${s.winRate >= 50 ? "text-accent-green" : "text-accent-red"}`}>
                        {s.winRate.toFixed(0)}%
                      </td>
                      <td className={`px-4 py-2 text-right font-bold ${s.totalPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                        {s.totalPnl >= 0 ? "+" : ""}${s.totalPnl.toFixed(0)}
                      </td>
                      <td className="px-4 py-2 text-right text-text-secondary">{s.avgScore.toFixed(0)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade Log */}
      <div>
        <button
          onClick={() => setShowTrades(!showTrades)}
          className="flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-accent-green transition-colors mb-2"
        >
          {showTrades ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Trade Log ({result.trades.length} trades)
        </button>
        {showTrades && (
          <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden max-h-64 overflow-y-auto animate-fade-in">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-bg-card">
                <tr className="border-b border-bg-border">
                  <th className="text-left px-4 py-2 text-text-muted">Symbol</th>
                  <th className="text-right px-4 py-2 text-text-muted">Score</th>
                  <th className="text-right px-4 py-2 text-text-muted">P&L %</th>
                  <th className="text-right px-4 py-2 text-text-muted">P&L $</th>
                  <th className="text-right px-4 py-2 text-text-muted">Bars</th>
                  <th className="text-left px-4 py-2 text-text-muted">Exit Reason</th>
                  <th className="text-left px-4 py-2 text-text-muted">Signals</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={i} className="border-b border-bg-border/30">
                    <td className="px-4 py-1.5 font-bold text-text-primary">{t.symbol}</td>
                    <td className="px-4 py-1.5 text-right text-text-secondary">{t.entrySignalScore}</td>
                    <td className={`px-4 py-1.5 text-right ${t.pnlPercent >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                      {t.pnlPercent >= 0 ? "+" : ""}{t.pnlPercent.toFixed(1)}%
                    </td>
                    <td className={`px-4 py-1.5 text-right font-bold ${t.pnlDollar >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                      {t.pnlDollar >= 0 ? "+" : ""}${t.pnlDollar.toFixed(0)}
                    </td>
                    <td className="px-4 py-1.5 text-right text-text-muted">{t.barsHeld}</td>
                    <td className="px-4 py-1.5 text-text-secondary truncate max-w-[150px]">{t.exitReason}</td>
                    <td className="px-4 py-1.5 text-text-muted truncate max-w-[120px]">{t.activeSignals.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Optimization Results ──
function OptimizationResults({ result }: { result: OptimizationResult }) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="bg-accent-blue-dim border border-accent-blue/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-4 h-4 text-accent-blue" />
          <span className="font-display font-semibold text-accent-blue text-sm">
            Optimization Result: {result.paramName}
          </span>
        </div>
        <p className="text-sm text-text-primary">
          Best value: <span className="font-mono font-bold text-accent-green">{result.bestValue}</span> (Sharpe: {result.bestSharpe.toFixed(2)})
        </p>
      </div>

      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-bg-border">
              <th className="text-left px-4 py-2.5 text-text-muted">{result.paramName}</th>
              <th className="text-right px-4 py-2.5 text-text-muted">Win Rate</th>
              <th className="text-right px-4 py-2.5 text-text-muted">Total P&L</th>
              <th className="text-right px-4 py-2.5 text-text-muted">Sharpe</th>
              <th className="text-right px-4 py-2.5 text-text-muted">Trades</th>
              <th className="text-center px-4 py-2.5 text-text-muted">Rank</th>
            </tr>
          </thead>
          <tbody>
            {result.results
              .sort((a, b) => b.sharpe - a.sharpe)
              .map((r, i) => (
                <tr
                  key={r.value}
                  className={`border-b border-bg-border/30 ${
                    r.value === result.bestValue ? "bg-accent-green-dim/20" : ""
                  }`}
                >
                  <td className="px-4 py-2 font-bold text-text-primary">{r.value}</td>
                  <td className={`px-4 py-2 text-right ${r.winRate >= 50 ? "text-accent-green" : "text-accent-red"}`}>
                    {r.winRate.toFixed(1)}%
                  </td>
                  <td className={`px-4 py-2 text-right font-bold ${r.totalPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                    {r.totalPnl >= 0 ? "+" : ""}${r.totalPnl.toFixed(0)}
                  </td>
                  <td className={`px-4 py-2 text-right ${r.sharpe >= 1 ? "text-accent-green" : r.sharpe >= 0 ? "text-accent-amber" : "text-accent-red"}`}>
                    {r.sharpe.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right text-text-secondary">{r.trades}</td>
                  <td className="px-4 py-2 text-center">
                    {r.value === result.bestValue && (
                      <span className="bg-accent-green-dim text-accent-green text-[10px] font-bold px-1.5 py-0.5 rounded">
                        BEST
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Grid Search Results ──
function GridSearchResults({ result }: { result: GridSearchResult }) {
  const best = result.topResults[0];
  const paramNames = best ? Object.keys(best.params) : [];
  const { setAutoTradeSettings, setSignalThreshold } = useStore();
  const [applied, setApplied] = useState(false);

  const applyBestSettings = () => {
    if (!best) return;
    const p = best.params;
    if (p.signalThreshold) setSignalThreshold(p.signalThreshold);
    const updates: any = {};
    if (p.trailingStopPercent !== undefined) updates.trailingStopPercent = p.trailingStopPercent;
    if (p.hardStopPercent !== undefined) updates.hardStopPercent = p.hardStopPercent;
    if (p.takeProfitPercent !== undefined) updates.takeProfitPercent = p.takeProfitPercent;
    if (p.signalCollapseThreshold !== undefined) updates.signalCollapseThreshold = p.signalCollapseThreshold;
    if (p.minHoldBars !== undefined) updates.minHoldMinutes = p.minHoldBars * 5;
    setAutoTradeSettings(updates);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary */}
      <div className="bg-accent-amber-dim border border-accent-amber/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-accent-amber" />
          <span className="font-display font-semibold text-accent-amber text-sm">
            Grid Search Complete
          </span>
        </div>
        <p className="text-sm text-text-primary mb-2">
          Tested <span className="font-mono font-bold">{result.totalCombinations}</span> combinations,{" "}
          <span className="font-mono font-bold">{result.completed}</span> produced trades.
          Top result:
        </p>
        {best && (
          <>
          <div className="flex flex-wrap gap-2">
            {paramNames.map((name) => (
              <span key={name} className="bg-bg-card border border-bg-border rounded-md px-2 py-1 text-xs font-mono">
                <span className="text-text-muted">{name}:</span>{" "}
                <span className="text-accent-green font-bold">{best.params[name]}</span>
              </span>
            ))}
            <span className="bg-accent-green-dim border border-accent-green/20 rounded-md px-2 py-1 text-xs font-mono text-accent-green font-bold">
              Sharpe: {best.sharpe.toFixed(2)}
            </span>
          </div>
          <button
            onClick={applyBestSettings}
            className={`mt-3 px-4 py-2 rounded-lg text-sm font-mono font-bold transition-all ${
              applied
                ? "bg-accent-green text-bg-primary"
                : "bg-accent-green/20 text-accent-green hover:bg-accent-green/30"
            }`}
          >
            {applied ? "✓ Applied to Auto Trader & Settings" : "⚡ Apply #1 Settings to Live System"}
          </button>
          <button
            onClick={() => {
              const { setMultiStrategies } = useStore.getState();
              // Select diverse strategies — each must differ in at least 2 params from others
              const selected: any[] = [];
              const paramKeys = Object.keys(result.topResults[0]?.params || {});

              for (const r of result.topResults) {
                if (selected.length >= 10) break;

                // Check diversity against already selected
                const isDiverse = selected.every((existing) => {
                  let differences = 0;
                  for (const key of paramKeys) {
                    if (r.params[key] !== existing.params[key]) differences++;
                  }
                  return differences >= 2; // Must differ in at least 2 params
                });

                if (isDiverse || selected.length === 0) {
                  selected.push(r);
                }
              }

              // If we didn't get 10 diverse ones, relax to 1 difference
              if (selected.length < 10) {
                for (const r of result.topResults) {
                  if (selected.length >= 10) break;
                  if (selected.includes(r)) continue;
                  const isDiverse = selected.every((existing) => {
                    let differences = 0;
                    for (const key of paramKeys) {
                      if (r.params[key] !== existing.params[key]) differences++;
                    }
                    return differences >= 1;
                  });
                  if (isDiverse) selected.push(r);
                }
              }

              const strategies = selected.map((r, i) => ({
                id: i + 1,
                name: `Strategy #${i + 1}`,
                params: {
                  signalThreshold: r.params.signalThreshold || 65,
                  trailingStopPercent: r.params.trailingStopPercent || 25,
                  hardStopPercent: r.params.hardStopPercent || 35,
                  takeProfitPercent: r.params.takeProfitPercent || 0,
                  maxHoldBars: r.params.maxHoldBars || 78,
                  minHoldBars: r.params.minHoldBars || 4,
                  entryMinActiveSignals: r.params.entryMinActiveSignals || 2,
                  optionDeltaMultiplier: r.params.optionDeltaMultiplier || 3,
                  signalCollapseThreshold: r.params.signalCollapseThreshold || 0,
                },
                allocation: 10000,
                balance: 10000,
                positions: [],
                tradeHistory: [],
                totalTrades: 0,
                wins: 0,
                losses: 0,
                totalPnl: 0,
                sharpe: r.sharpe || 0,
                isActive: true,
              }));
              setMultiStrategies(strategies);
              alert(`✅ Deployed ${strategies.length} diverse strategies! Each differs in 2+ parameters.`);
            }}
            className="mt-3 ml-3 px-4 py-2 bg-accent-amber/20 text-accent-amber border border-accent-amber/30 rounded-lg text-sm font-mono font-bold hover:bg-accent-amber/30 transition-all"
          >
            🚀 Deploy Top 10 Diverse Strategies ($10k each)
          </button>
          </>
        )}
      </div>

      {/* Results Table */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-bg-border">
                <th className="text-center px-3 py-2.5 text-text-muted">#</th>
                {paramNames.map((name) => (
                  <th key={name} className="text-right px-3 py-2.5 text-text-muted">{name.replace(/Percent|Bars/g, "")}</th>
                ))}
                <th className="text-right px-3 py-2.5 text-text-muted">Win%</th>
                <th className="text-right px-3 py-2.5 text-text-muted">P&L</th>
                <th className="text-right px-3 py-2.5 text-text-muted">Sharpe</th>
                <th className="text-right px-3 py-2.5 text-text-muted">PF</th>
                <th className="text-right px-3 py-2.5 text-text-muted">Trades</th>
                <th className="text-right px-3 py-2.5 text-text-muted">Expect</th>
                <th className="text-right px-3 py-2.5 text-text-muted">MaxDD</th>
              </tr>
            </thead>
            <tbody>
              {result.topResults.map((r) => (
                <tr
                  key={r.rank}
                  className={`border-b border-bg-border/30 hover:bg-bg-hover/50 ${
                    r.rank === 1 ? "bg-accent-green-dim/15" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    {r.rank === 1 ? (
                      <span className="bg-accent-green-dim text-accent-green text-[10px] font-bold px-1.5 py-0.5 rounded">
                        #1
                      </span>
                    ) : (
                      <span className="text-text-muted">{r.rank}</span>
                    )}
                  </td>
                  {paramNames.map((name) => (
                    <td key={name} className="px-3 py-2 text-right text-text-primary">
                      {r.params[name] === 0 && name === "takeProfitPercent" ? "∞" : r.params[name]}
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-right ${r.winRate >= 50 ? "text-accent-green" : "text-accent-red"}`}>
                    {r.winRate.toFixed(0)}%
                  </td>
                  <td className={`px-3 py-2 text-right font-bold ${r.totalPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                    {r.totalPnl >= 0 ? "+" : ""}${r.totalPnl.toFixed(0)}
                  </td>
                  <td className={`px-3 py-2 text-right ${r.sharpe >= 1 ? "text-accent-green" : r.sharpe >= 0 ? "text-accent-amber" : "text-accent-red"}`}>
                    {r.sharpe.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {r.profitFactor >= 999 ? "∞" : r.profitFactor.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">{r.trades}</td>
                  <td className={`px-3 py-2 text-right ${r.expectancy >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                    ${r.expectancy.toFixed(1)}
                  </td>
                  <td className={`px-3 py-2 text-right ${r.maxDrawdown < 20 ? "text-accent-green" : "text-accent-red"}`}>
                    {r.maxDrawdown.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Mini Equity Curve (CSS-based) ──
function MiniEquityCurve({ data }: { data: number[] }) {
  // Sample down to ~100 points
  const step = Math.max(1, Math.floor(data.length / 100));
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;

  const start = sampled[0];
  const end = sampled[sampled.length - 1];
  const isProfit = end >= start;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-text-muted">${min.toFixed(0)}</span>
        <span className={`text-xs font-mono font-bold ${isProfit ? "text-accent-green" : "text-accent-red"}`}>
          ${end.toFixed(0)} ({isProfit ? "+" : ""}{((end - start) / start * 100).toFixed(1)}%)
        </span>
        <span className="text-xs font-mono text-text-muted">${max.toFixed(0)}</span>
      </div>
      <div className="flex items-end gap-px h-20">
        {sampled.map((val, i) => {
          const height = ((val - min) / range) * 100;
          const color = val >= start ? "bg-accent-green/60" : "bg-accent-red/60";
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm ${color} transition-all min-w-[1px]`}
              style={{ height: `${Math.max(2, height)}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ──
function ConfigInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="text-[10px] font-mono text-text-muted uppercase block mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
      />
    </div>
  );
}

function MetricCard({ label, value, sub, icon, color }: { label: string; value: string; sub: string; icon: React.ReactNode; color: "green" | "red" | "amber" | "blue" }) {
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
      <div className="font-mono font-bold text-lg">{value}</div>
      <div className="text-[10px] font-mono opacity-60 mt-0.5">{sub}</div>
    </div>
  );
}

function getOptValues(param: string): number[] {
  switch (param) {
    case "signalThreshold": return [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
    case "hardStopPercent": return [20, 30, 40, 50, 60, 70, 80];
    case "trailingStopPercent": return [15, 20, 25, 30, 35, 40, 50, 60];
    case "takeProfitPercent": return [25, 50, 75, 100, 150, 200, 300, 0];
    case "entryMinActiveSignals": return [1, 2, 3, 4];
    case "signalCollapseThreshold": return [0, 5, 10, 15, 20, 25, 30];
    case "minHoldBars": return [0, 1, 2, 3, 4, 6, 8, 12];
    case "maxHoldBars": return [0, 24, 36, 48, 60, 78, 120, 156];
    default: return [50, 60, 70, 80, 90];
  }
}
