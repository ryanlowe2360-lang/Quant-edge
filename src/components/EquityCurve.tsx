"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, BarChart2 } from "lucide-react";
import { PaperTrade } from "@/lib/types";

interface EquityCurveProps {
  trades: PaperTrade[];
  startingBalance: number;
  source?: "USER" | "SYSTEM" | "ALL";
}

interface DataPoint {
  date: string;
  balance: number;
  pnl: number;
  tradeCount: number;
}

export default function EquityCurve({ trades, startingBalance, source = "ALL" }: EquityCurveProps) {
  const data = useMemo(() => {
    // Filter by source
    let filtered = trades.filter((t) => t.status === "CLOSED" && t.exitTime);
    if (source === "USER") filtered = filtered.filter((t) => t.source === "USER");
    if (source === "SYSTEM") filtered = filtered.filter((t) => t.source === "SYSTEM" || !t.source);

    // Sort by exit time
    filtered.sort((a, b) => new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime());

    if (filtered.length === 0) return [];

    // Group by date and calculate running balance
    const byDate: Record<string, { pnl: number; count: number }> = {};
    for (const trade of filtered) {
      const date = trade.exitTime!.slice(0, 10);
      if (!byDate[date]) byDate[date] = { pnl: 0, count: 0 };
      byDate[date].pnl += trade.pnl || 0;
      byDate[date].count++;
    }

    const points: DataPoint[] = [];
    let runningBalance = startingBalance;

    const dates = Object.keys(byDate).sort();
    for (const date of dates) {
      runningBalance += byDate[date].pnl;
      points.push({
        date,
        balance: runningBalance,
        pnl: byDate[date].pnl,
        tradeCount: byDate[date].count,
      });
    }

    return points;
  }, [trades, startingBalance, source]);

  if (data.length < 2) {
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl p-6 text-center">
        <BarChart2 className="w-6 h-6 text-text-muted mx-auto mb-2" />
        <p className="text-text-muted text-xs font-mono">
          Need at least 2 trading days to show equity curve.
        </p>
      </div>
    );
  }

  const currentBalance = data[data.length - 1].balance;
  const totalPnl = currentBalance - startingBalance;
  const totalReturn = ((totalPnl / startingBalance) * 100);
  const maxBalance = Math.max(...data.map((d) => d.balance));
  const minBalance = Math.min(...data.map((d) => d.balance));
  const maxDrawdown = data.reduce((max, d) => {
    const dd = ((maxBalance - d.balance) / maxBalance) * 100;
    return Math.max(max, dd);
  }, 0);

  // SVG chart dimensions
  const W = 600;
  const H = 180;
  const PAD = { top: 10, right: 10, bottom: 25, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const yMin = Math.min(minBalance, startingBalance) * 0.95;
  const yMax = maxBalance * 1.05;
  const yRange = yMax - yMin || 1;

  const xScale = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
  const yScale = (val: number) => PAD.top + chartH - ((val - yMin) / yRange) * chartH;

  // Build path
  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(d.balance).toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L ${xScale(data.length - 1).toFixed(1)} ${yScale(yMin).toFixed(1)} L ${xScale(0).toFixed(1)} ${yScale(yMin).toFixed(1)} Z`;

  // Starting balance line
  const startY = yScale(startingBalance);

  // Y-axis labels
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (yRange * i) / yTicks);

  // X-axis labels (show first, middle, last)
  const xLabels = [0, Math.floor(data.length / 2), data.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => ({ i, label: formatDate(data[i].date) }));

  const lineColor = totalPnl >= 0 ? "#00d4a1" : "#ff4757";
  const areaColor = totalPnl >= 0 ? "#00d4a122" : "#ff475722";

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-accent-green" />
        <span className="font-display font-semibold text-text-primary text-sm">
          Equity Curve
        </span>
        <span className="text-text-muted text-xs font-mono ml-auto">
          {source === "ALL" ? "All Trades" : source === "USER" ? "Your Trades" : "System Trades"}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-px bg-bg-border">
        <MiniStat
          label="Balance"
          value={`$${currentBalance.toFixed(0)}`}
          color={currentBalance >= startingBalance ? "green" : "red"}
        />
        <MiniStat
          label="Total P&L"
          value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)}`}
          color={totalPnl >= 0 ? "green" : "red"}
        />
        <MiniStat
          label="Return"
          value={`${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%`}
          color={totalReturn >= 0 ? "green" : "red"}
        />
        <MiniStat
          label="Max DD"
          value={`-${maxDrawdown.toFixed(1)}%`}
          color={maxDrawdown > 20 ? "red" : maxDrawdown > 10 ? "amber" : "green"}
        />
      </div>

      {/* SVG Chart */}
      <div className="p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "180px" }}>
          {/* Grid lines */}
          {yLabels.map((val, i) => (
            <g key={i}>
              <line
                x1={PAD.left} y1={yScale(val)} x2={W - PAD.right} y2={yScale(val)}
                stroke="#1e293b" strokeWidth="0.5"
              />
              <text
                x={PAD.left - 5} y={yScale(val) + 3}
                textAnchor="end" fontSize="8" fill="#64748b" fontFamily="monospace"
              >
                ${Math.round(val)}
              </text>
            </g>
          ))}

          {/* Starting balance reference line */}
          <line
            x1={PAD.left} y1={startY} x2={W - PAD.right} y2={startY}
            stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.5"
          />
          <text
            x={W - PAD.right + 2} y={startY + 3}
            fontSize="7" fill="#f59e0b" fontFamily="monospace" opacity="0.7"
          >
            start
          </text>

          {/* Area fill */}
          <path d={areaPath} fill={areaColor} />

          {/* Line */}
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots on winning/losing days */}
          {data.map((d, i) => (
            <circle
              key={i}
              cx={xScale(i)} cy={yScale(d.balance)}
              r={data.length > 30 ? 1.5 : 3}
              fill={d.pnl >= 0 ? "#00d4a1" : "#ff4757"}
              opacity={0.8}
            />
          ))}

          {/* X-axis labels */}
          {xLabels.map(({ i, label }) => (
            <text
              key={i}
              x={xScale(i)} y={H - 3}
              textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="monospace"
            >
              {label}
            </text>
          ))}
        </svg>
      </div>

      {/* Daily P&L bar chart (small) */}
      <div className="px-4 pb-3">
        <div className="text-[10px] font-mono text-text-muted mb-1">Daily P&L</div>
        <div className="flex items-end gap-px" style={{ height: "32px" }}>
          {data.map((d, i) => {
            const maxPnl = Math.max(...data.map((x) => Math.abs(x.pnl))) || 1;
            const barH = Math.max(2, (Math.abs(d.pnl) / maxPnl) * 28);
            return (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${barH}px`,
                  backgroundColor: d.pnl >= 0 ? "#00d4a1" : "#ff4757",
                  opacity: 0.7,
                  minWidth: "2px",
                }}
                title={`${d.date}: ${d.pnl >= 0 ? "+" : ""}$${d.pnl.toFixed(0)} (${d.tradeCount} trades)`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: "green" | "red" | "amber" }) {
  const colors = {
    green: "text-accent-green",
    red: "text-accent-red",
    amber: "text-accent-amber",
  };
  return (
    <div className="bg-bg-card px-3 py-2">
      <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider">{label}</div>
      <div className={`font-mono font-bold text-sm ${colors[color]}`}>{value}</div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
