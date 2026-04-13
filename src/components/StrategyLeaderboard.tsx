"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { StrategySlot, autoPruneStrategies } from "@/lib/multi-strategy";
import { sendTelegramMessage } from "@/lib/telegram";
import { Trophy, TrendingUp, TrendingDown, Activity, Target, Zap, ChevronDown, ChevronRight, Scissors } from "lucide-react";

export default function StrategyLeaderboard() {
  const { multiStrategies, convergenceAlerts, setMultiStrategies } = useStore();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (multiStrategies.length === 0) {
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl p-8 text-center">
        <Trophy className="w-10 h-10 text-text-muted mx-auto mb-4" />
        <h3 className="font-display font-bold text-text-primary text-lg mb-2">
          No Strategies Running
        </h3>
        <p className="text-text-secondary text-sm max-w-md mx-auto mb-4">
          Run a Grid Search in the Backtest tab, then click "Deploy Top 10 as Multi-Strategy"
          to start 10 independent auto-traders each with $10k allocation.
        </p>
      </div>
    );
  }

  const sorted = [...multiStrategies].sort((a, b) => b.totalPnl - a.totalPnl);
  const totalPnl = sorted.reduce((sum, s) => sum + s.totalPnl, 0);
  const totalTrades = sorted.reduce((sum, s) => sum + s.totalTrades, 0);
  const totalWins = sorted.reduce((sum, s) => sum + s.wins, 0);

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-bg-card border border-bg-border rounded-xl p-4">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">Combined P&L</div>
          <div className={`text-xl font-mono font-bold ${totalPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(0)}
          </div>
        </div>
        <div className="bg-bg-card border border-bg-border rounded-xl p-4">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">Total Trades</div>
          <div className="text-xl font-mono font-bold text-text-primary">{totalTrades}</div>
        </div>
        <div className="bg-bg-card border border-bg-border rounded-xl p-4">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">Win Rate</div>
          <div className={`text-xl font-mono font-bold ${totalTrades > 0 && totalWins / totalTrades >= 0.5 ? "text-accent-green" : "text-accent-amber"}`}>
            {totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(0) : 0}%
          </div>
        </div>
        <div className="bg-bg-card border border-bg-border rounded-xl p-4">
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1">Active Strategies</div>
          <div className="text-xl font-mono font-bold text-accent-blue">
            {multiStrategies.filter((s) => s.isActive).length}/10
          </div>
        </div>
      </div>

      {/* Convergence Alerts */}
      {convergenceAlerts.length > 0 && (
        <div className="bg-accent-amber-dim border border-accent-amber/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-accent-amber" />
            <span className="font-mono font-bold text-accent-amber text-sm">Strategy Convergence</span>
          </div>
          {convergenceAlerts.slice(0, 3).map((ca, i) => (
            <div key={i} className="text-sm text-text-primary mb-1">
              <span className="font-mono font-bold">{ca.symbol}</span> — {ca.count} strategies agree
              (#{ca.strategiesAgreeing.join(", #")}) — Avg Score: {ca.avgScore.toFixed(0)}
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
          <h3 className="font-display font-semibold text-text-primary text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent-amber" />
            Strategy Leaderboard
          </h3>
          {totalTrades >= 10 && (
            <button
              onClick={() => {
                const { prunedStrategies, pruneLog } = autoPruneStrategies(multiStrategies);
                setMultiStrategies(prunedStrategies);
                const msg = `✂️ *AUTO-PRUNE*\n${pruneLog.join("\n")}`;
                sendTelegramMessage(msg);
                alert(pruneLog.join("\n"));
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-accent-red/10 text-accent-red border border-accent-red/20 rounded-lg text-[10px] font-mono font-bold hover:bg-accent-red/20 transition-all"
            >
              <Scissors className="w-3 h-3" />
              Prune Losers
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-bg-border">
                <th className="text-center px-3 py-2.5 text-text-muted">Rank</th>
                <th className="text-left px-3 py-2.5 text-text-muted">Strategy</th>
                <th className="text-right px-3 py-2.5 text-text-muted">P&L</th>
                <th className="text-right px-3 py-2.5 text-text-muted">Win%</th>
                <th className="text-right px-3 py-2.5 text-text-muted">Trades</th>
                <th className="text-right px-3 py-2.5 text-text-muted">Balance</th>
                <th className="text-right px-3 py-2.5 text-text-muted">Open</th>
                <th className="text-right px-3 py-2.5 text-text-muted">Sharpe</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((strategy, rank) => {
                const winRate = strategy.totalTrades > 0 ? (strategy.wins / strategy.totalTrades * 100) : 0;
                const openPositions = strategy.positions.filter((p) => p.status === "OPEN");
                const isExpanded = expandedId === strategy.id;

                return (
                  <>
                    <tr
                      key={strategy.id}
                      className={`border-b border-bg-border/30 hover:bg-bg-hover/50 cursor-pointer ${
                        rank === 0 ? "bg-accent-green-dim/10" : ""
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : strategy.id)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        {rank === 0 ? (
                          <span className="bg-accent-green-dim text-accent-green text-[10px] font-bold px-1.5 py-0.5 rounded">
                            🏆
                          </span>
                        ) : (
                          <span className="text-text-muted">#{rank + 1}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-text-primary">{strategy.name}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${strategy.totalPnl >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                        {strategy.totalPnl >= 0 ? "+" : ""}${strategy.totalPnl.toFixed(0)}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${winRate >= 50 ? "text-accent-green" : "text-accent-red"}`}>
                        {winRate.toFixed(0)}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-secondary">{strategy.totalTrades}</td>
                      <td className="px-3 py-2.5 text-right text-text-secondary">${strategy.balance.toFixed(0)}</td>
                      <td className="px-3 py-2.5 text-right text-text-secondary">{openPositions.length}</td>
                      <td className={`px-3 py-2.5 text-right ${strategy.sharpe >= 1 ? "text-accent-green" : "text-accent-amber"}`}>
                        {strategy.sharpe.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {isExpanded ? <ChevronDown className="w-3 h-3 text-text-muted" /> : <ChevronRight className="w-3 h-3 text-text-muted" />}
                      </td>
                    </tr>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <tr key={`${strategy.id}-detail`}>
                        <td colSpan={9} className="px-4 py-3 bg-bg-primary/50">
                          <div className="space-y-3">
                            {/* Parameters */}
                            <div>
                              <span className="text-[10px] font-mono text-text-muted uppercase">Parameters</span>
                              <div className="flex flex-wrap gap-2 mt-1">
                                <ParamBadge label="Threshold" value={strategy.params.signalThreshold} />
                                <ParamBadge label="Trail%" value={strategy.params.trailingStopPercent} />
                                <ParamBadge label="Hard%" value={strategy.params.hardStopPercent} />
                                <ParamBadge label="TP%" value={strategy.params.takeProfitPercent === 0 ? "∞" : strategy.params.takeProfitPercent} />
                                <ParamBadge label="MaxHold" value={strategy.params.maxHoldBars} />
                                <ParamBadge label="MinSig" value={strategy.params.entryMinActiveSignals} />
                              </div>
                            </div>

                            {/* Open Positions */}
                            {openPositions.length > 0 && (
                              <div>
                                <span className="text-[10px] font-mono text-text-muted uppercase">Open Positions</span>
                                <div className="space-y-1 mt-1">
                                  {openPositions.map((pos) => (
                                    <div key={pos.id} className="flex items-center gap-3 text-xs">
                                      <span className="font-bold text-text-primary">{pos.symbol}</span>
                                      <span className={pos.pnlPercent >= 0 ? "text-accent-green" : "text-accent-red"}>
                                        {pos.pnlPercent >= 0 ? "+" : ""}{pos.pnlPercent.toFixed(1)}%
                                      </span>
                                      <span className="text-text-muted">{pos.barsHeld} bars</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Recent Trades */}
                            {strategy.tradeHistory.length > 0 && (
                              <div>
                                <span className="text-[10px] font-mono text-text-muted uppercase">Recent Trades</span>
                                <div className="space-y-1 mt-1">
                                  {strategy.tradeHistory.slice(-5).reverse().map((trade) => (
                                    <div key={trade.id} className="flex items-center gap-3 text-xs">
                                      <span className="font-bold text-text-primary">{trade.symbol}</span>
                                      <span className={trade.pnlDollar >= 0 ? "text-accent-green" : "text-accent-red"}>
                                        {trade.pnlDollar >= 0 ? "+" : ""}${trade.pnlDollar.toFixed(0)}
                                      </span>
                                      <span className="text-text-muted truncate">{trade.exitReason}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ParamBadge({ label, value }: { label: string; value: any }) {
  return (
    <span className="bg-bg-card border border-bg-border rounded px-2 py-0.5 text-[10px] font-mono">
      <span className="text-text-muted">{label}:</span>{" "}
      <span className="text-text-primary font-bold">{value}</span>
    </span>
  );
}
