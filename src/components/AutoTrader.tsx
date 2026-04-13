"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { format } from "date-fns";
import {
  Bot,
  Power,
  PowerOff,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Shield,
  AlertTriangle,
  Activity,
  Clock,
  Zap,
  XCircle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Lock,
} from "lucide-react";
import type { AutoTradeExecution, LivePosition } from "@/lib/types";
import StrategyLeaderboard from "./StrategyLeaderboard";

export default function AutoTrader() {
  const {
    autoTradeSettings,
    setAutoTradeSettings,
    livePositions,
    executions,
    clearExecutions,
    dailyStats,
    closePositionAndLog,
    getPortfolioStats,
    quotes,
    signals,
  } = useStore();

  const stats = getPortfolioStats();
  const [showConfig, setShowConfig] = useState(false);

  const isActive = autoTradeSettings.mode !== "OFF";
  const totalUnrealized = livePositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

  return (
    <div className="space-y-6">
      {/* Master Control Bar */}
      <div
        className={`rounded-xl border p-5 transition-all ${
          isActive
            ? "bg-accent-green-dim border-accent-green/30"
            : "bg-bg-card border-bg-border"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isActive ? "bg-accent-green/20" : "bg-bg-hover"
              }`}
            >
              <Bot
                className={`w-5 h-5 ${isActive ? "text-accent-green" : "text-text-muted"}`}
              />
            </div>
            <div>
              <h2 className="font-display font-bold text-text-primary text-lg">
                Auto Trader
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isActive ? "bg-accent-green animate-pulse" : "bg-text-muted"
                  }`}
                />
                <span
                  className={`text-xs font-mono ${
                    isActive ? "text-accent-green" : "text-text-muted"
                  }`}
                >
                  {autoTradeSettings.mode === "PAPER"
                    ? "PAPER TRADING"
                    : autoTradeSettings.mode === "ALERTS_ONLY"
                      ? "ALERTS ONLY"
                      : "OFFLINE"}
                </span>
                {dailyStats.isLocked && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-accent-red bg-accent-red-dim px-1.5 py-0.5 rounded">
                    <Lock className="w-2.5 h-2.5" />
                    DAILY LIMIT HIT
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-3 py-2 bg-bg-hover border border-bg-border rounded-lg text-text-secondary text-xs font-mono hover:border-accent-green/40 transition-all"
            >
              Configure
            </button>
            {autoTradeSettings.mode === "OFF" ? (
              <button
                onClick={() => setAutoTradeSettings({ mode: "PAPER" })}
                className="flex items-center gap-2 px-4 py-2 bg-accent-green text-bg-primary rounded-lg text-sm font-mono font-bold hover:bg-accent-green/90 transition-all"
              >
                <Power className="w-4 h-4" />
                Enable Paper
              </button>
            ) : (
              <button
                onClick={() => setAutoTradeSettings({ mode: "OFF" })}
                className="flex items-center gap-2 px-4 py-2 bg-accent-red/20 text-accent-red rounded-lg text-sm font-mono font-bold hover:bg-accent-red/30 transition-all"
              >
                <PowerOff className="w-4 h-4" />
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Configuration Panel */}
      {showConfig && <ConfigPanel />}

      {/* Live Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Open Positions"
          value={`${livePositions.length}/${autoTradeSettings.maxOpenPositions}`}
          icon={<Activity className="w-4 h-4" />}
          color={livePositions.length >= autoTradeSettings.maxOpenPositions ? "amber" : "blue"}
        />
        <StatCard
          label="Unrealized P&L"
          value={`${totalUnrealized >= 0 ? "+" : ""}$${totalUnrealized.toFixed(0)}`}
          icon={totalUnrealized >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          color={totalUnrealized >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Today's P&L"
          value={`${dailyStats.realizedPnl >= 0 ? "+" : ""}$${dailyStats.realizedPnl.toFixed(0)}`}
          icon={<DollarSign className="w-4 h-4" />}
          color={dailyStats.realizedPnl >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Today's Record"
          value={`${dailyStats.winCount}W / ${dailyStats.lossCount}L`}
          icon={<Target className="w-4 h-4" />}
          color={dailyStats.winCount >= dailyStats.lossCount ? "green" : "amber"}
        />
        <StatCard
          label="Trades Today"
          value={`${dailyStats.tradesOpened}/${autoTradeSettings.maxDailyTrades}`}
          icon={<Zap className="w-4 h-4" />}
          color={dailyStats.tradesOpened >= autoTradeSettings.maxDailyTrades ? "red" : "blue"}
        />
      </div>

      {/* Live Positions */}
      <div>
        <h3 className="font-display font-semibold text-text-primary mb-3">
          Live Positions
        </h3>
        {livePositions.length === 0 ? (
          <div className="bg-bg-card border border-bg-border rounded-xl p-8 text-center">
            <Shield className="w-8 h-8 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary text-sm">
              {isActive
                ? "Waiting for signals to meet entry criteria..."
                : "Enable auto-trading to start scanning for entries."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {livePositions.map((pos) => (
              <PositionRow
                key={pos.id}
                position={pos}
                onClose={closePositionAndLog}
              />
            ))}
          </div>
        )}
      </div>

      {/* Execution Log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-text-primary">
            Execution Log
          </h3>
          {executions.length > 0 && (
            <button
              onClick={clearExecutions}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-red font-mono transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
        {executions.length === 0 ? (
          <div className="bg-bg-card border border-bg-border rounded-xl p-6 text-center">
            <Clock className="w-6 h-6 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-xs font-mono">No executions yet</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {executions.slice(0, 50).map((exec) => (
              <ExecutionRow key={exec.id} execution={exec} />
            ))}
          </div>
        )}
      </div>

      {/* Multi-Strategy Leaderboard */}
      <StrategyLeaderboard />
    </div>
  );
}

// ── Position Row ──
function PositionRow({
  position,
  onClose,
}: {
  position: LivePosition;
  onClose: (id: string, exitPrice: number, reason: string, action: any) => void;
}) {
  const [showManualClose, setShowManualClose] = useState(false);
  const [exitPrice, setExitPrice] = useState("");

  const pnlColor = position.unrealizedPnl >= 0 ? "text-accent-green" : "text-accent-red";
  const pnlBg = position.unrealizedPnl >= 0 ? "bg-accent-green-dim" : "bg-accent-red-dim";

  return (
    <div
      className={`bg-bg-card border rounded-xl p-4 transition-all ${
        position.exitSignalActive
          ? "border-accent-red/40 bg-accent-red-dim/10"
          : "border-bg-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-text-primary text-base">
            {position.symbol}
          </span>
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
              position.type === "CALL"
                ? "bg-accent-green-dim text-accent-green"
                : "bg-accent-red-dim text-accent-red"
            }`}
          >
            {position.type}
          </span>
          <span className="text-xs font-mono text-text-muted">
            ${position.strike} | {position.expiry} | ×{position.quantity}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* P&L */}
          <div className={`rounded-lg px-3 py-1.5 ${pnlBg}`}>
            <span className={`font-mono font-bold text-sm ${pnlColor}`}>
              {position.unrealizedPnl >= 0 ? "+" : ""}${position.unrealizedPnl.toFixed(0)}
            </span>
            <span className={`font-mono text-xs ml-1 ${pnlColor} opacity-70`}>
              ({position.unrealizedPnlPercent >= 0 ? "+" : ""}
              {position.unrealizedPnlPercent.toFixed(1)}%)
            </span>
          </div>

          <button
            onClick={() => setShowManualClose(!showManualClose)}
            className="px-3 py-1.5 bg-accent-red/20 text-accent-red rounded-lg text-xs font-mono font-medium hover:bg-accent-red/30 transition-all"
          >
            Close
          </button>
        </div>
      </div>

      {/* Price info */}
      <div className="flex items-center gap-4 mt-2 text-xs font-mono text-text-muted">
        <span>Entry: ${position.entryPrice.toFixed(2)}</span>
        <span>Current: ${position.currentPrice.toFixed(2)}</span>
        <span>High: ${position.highWaterMark.toFixed(2)}</span>
        <span>Signal: {position.signalScore}</span>
        <span>{format(new Date(position.entryTime), "h:mm a")}</span>
      </div>

      {/* Exit signal warning */}
      {position.exitSignalActive && (
        <div className="flex items-center gap-2 mt-2 px-2 py-1.5 bg-accent-red-dim rounded-lg">
          <AlertTriangle className="w-3.5 h-3.5 text-accent-red" />
          <span className="text-xs font-mono text-accent-red">
            {position.exitSignalReason}
          </span>
        </div>
      )}

      {/* Manual close */}
      {showManualClose && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-bg-border animate-fade-in">
          <input
            placeholder="Exit price"
            type="number"
            step="0.01"
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-red/50"
          />
          <button
            onClick={() => {
              if (exitPrice) {
                onClose(position.id, parseFloat(exitPrice), "Manual close", "CLOSE");
                setShowManualClose(false);
              }
            }}
            className="px-3 py-1.5 bg-accent-red text-white rounded-lg text-xs font-mono font-bold"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

// ── Execution Row ──
function ExecutionRow({ execution }: { execution: AutoTradeExecution }) {
  const actionColors: Record<string, string> = {
    OPEN: "bg-accent-green-dim text-accent-green",
    CLOSE: "bg-accent-blue-dim text-accent-blue",
    STOP_HIT: "bg-accent-red-dim text-accent-red",
    TAKE_PROFIT: "bg-accent-green-dim text-accent-green",
    FORCED_EXIT: "bg-accent-red-dim text-accent-red",
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-bg-card border border-bg-border/50 rounded-lg text-xs font-mono">
      <span
        className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
          actionColors[execution.action] || "bg-bg-hover text-text-muted"
        }`}
      >
        {execution.action.replace("_", " ")}
      </span>
      <span className="font-bold text-text-primary">{execution.symbol}</span>
      <span className="text-text-secondary flex-1 truncate">{execution.reason}</span>
      <span className="text-text-muted">
        ${execution.price.toFixed(2)} ×{execution.quantity}
      </span>
      <span className="text-text-muted">
        {format(new Date(execution.timestamp), "h:mm:ss a")}
      </span>
    </div>
  );
}

// ── Configuration Panel ──
function ConfigPanel() {
  const { autoTradeSettings, setAutoTradeSettings } = useStore();

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl p-5 space-y-5 animate-fade-in">
      <h3 className="font-display font-semibold text-text-primary">
        Auto-Trade Configuration
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Mode */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Mode
          </label>
          <select
            value={autoTradeSettings.mode}
            onChange={(e) => setAutoTradeSettings({ mode: e.target.value as any })}
            className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
          >
            <option value="OFF">Off — No auto-trading</option>
            <option value="ALERTS_ONLY">Alerts Only — Notify but don't execute</option>
            <option value="PAPER">Paper Trade — Auto-execute paper trades</option>
          </select>
        </div>

        {/* Max Open Positions */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Max Open Positions
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              value={autoTradeSettings.maxOpenPositions}
              onChange={(e) => setAutoTradeSettings({ maxOpenPositions: parseInt(e.target.value) })}
              className="flex-1 accent-accent-green"
            />
            <span className="font-mono font-bold text-accent-green min-w-[24px] text-center">
              {autoTradeSettings.maxOpenPositions}
            </span>
          </div>
        </div>

        {/* Max Risk Per Trade */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Max Risk Per Trade (% of balance)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={20}
              value={autoTradeSettings.maxRiskPerTrade}
              onChange={(e) => setAutoTradeSettings({ maxRiskPerTrade: parseInt(e.target.value) })}
              className="flex-1 accent-accent-green"
            />
            <span className="font-mono font-bold text-accent-green min-w-[32px] text-center">
              {autoTradeSettings.maxRiskPerTrade}%
            </span>
          </div>
        </div>

        {/* Max Daily Loss */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Max Daily Loss ($)
          </label>
          <input
            type="number"
            value={autoTradeSettings.maxDailyLoss}
            onChange={(e) => setAutoTradeSettings({ maxDailyLoss: parseInt(e.target.value) || 50 })}
            className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-text-primary font-mono text-sm focus:outline-none focus:border-accent-green/50"
          />
        </div>

        {/* Max Daily Trades */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Max Trades Per Day
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={20}
              value={autoTradeSettings.maxDailyTrades}
              onChange={(e) => setAutoTradeSettings({ maxDailyTrades: parseInt(e.target.value) })}
              className="flex-1 accent-accent-green"
            />
            <span className="font-mono font-bold text-accent-green min-w-[24px] text-center">
              {autoTradeSettings.maxDailyTrades}
            </span>
          </div>
        </div>

        {/* Hard Stop % */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Hard Stop Loss (%)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={80}
              step={5}
              value={autoTradeSettings.hardStopPercent}
              onChange={(e) => setAutoTradeSettings({ hardStopPercent: parseInt(e.target.value) })}
              className="flex-1 accent-accent-red"
            />
            <span className="font-mono font-bold text-accent-red min-w-[32px] text-center">
              {autoTradeSettings.hardStopPercent}%
            </span>
          </div>
        </div>

        {/* Trailing Stop % */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Trailing Stop (% from high)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={autoTradeSettings.trailingStopPercent}
              onChange={(e) => setAutoTradeSettings({ trailingStopPercent: parseInt(e.target.value) })}
              className="flex-1 accent-accent-amber"
            />
            <span className="font-mono font-bold text-accent-amber min-w-[32px] text-center">
              {autoTradeSettings.trailingStopPercent}%
            </span>
          </div>
        </div>

        {/* Take Profit % */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Take Profit (% gain, 0 = disabled)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={500}
              step={25}
              value={autoTradeSettings.takeProfitPercent}
              onChange={(e) => setAutoTradeSettings({ takeProfitPercent: parseInt(e.target.value) })}
              className="flex-1 accent-accent-green"
            />
            <span className="font-mono font-bold text-accent-green min-w-[40px] text-center">
              {autoTradeSettings.takeProfitPercent === 0
                ? "OFF"
                : `${autoTradeSettings.takeProfitPercent}%`}
            </span>
          </div>
        </div>

        {/* Cooldown */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Cooldown Between Trades (min)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={60}
              step={5}
              value={autoTradeSettings.cooldownMinutes}
              onChange={(e) => setAutoTradeSettings({ cooldownMinutes: parseInt(e.target.value) })}
              className="flex-1 accent-accent-green"
            />
            <span className="font-mono font-bold text-accent-green min-w-[32px] text-center">
              {autoTradeSettings.cooldownMinutes}m
            </span>
          </div>
        </div>

        {/* Require Options Liquidity */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoTradeSettings.requireOptionsLiquidity}
              onChange={(e) =>
                setAutoTradeSettings({ requireOptionsLiquidity: e.target.checked })
              }
              className="w-4 h-4 accent-accent-green"
            />
            <span className="text-sm text-text-primary">
              Require HIGH/MED options liquidity
            </span>
          </label>
        </div>

        {/* Signal Collapse Threshold */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Signal Collapse Exit (0 = disabled)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={30}
              step={5}
              value={autoTradeSettings.signalCollapseThreshold}
              onChange={(e) => setAutoTradeSettings({ signalCollapseThreshold: parseInt(e.target.value) })}
              className="flex-1 accent-accent-amber"
            />
            <span className="font-mono font-bold text-accent-amber min-w-[32px] text-center">
              {autoTradeSettings.signalCollapseThreshold === 0
                ? "OFF"
                : autoTradeSettings.signalCollapseThreshold}
            </span>
          </div>
          <span className="text-[10px] text-text-muted mt-1 block">
            Backtest showed disabling this improved P&L from -93% to +58%
          </span>
        </div>

        {/* Min Hold Period */}
        <div>
          <label className="text-xs font-mono text-text-muted uppercase tracking-wider block mb-1.5">
            Min Hold Before Exit (min)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={60}
              step={5}
              value={autoTradeSettings.minHoldMinutes}
              onChange={(e) => setAutoTradeSettings({ minHoldMinutes: parseInt(e.target.value) })}
              className="flex-1 accent-accent-green"
            />
            <span className="font-mono font-bold text-accent-green min-w-[32px] text-center">
              {autoTradeSettings.minHoldMinutes}m
            </span>
          </div>
          <span className="text-[10px] text-text-muted mt-1 block">
            Only hard stop can trigger before this. Prevents noise exits.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ──
function StatCard({
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
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-mono font-bold text-lg">{value}</div>
    </div>
  );
}
