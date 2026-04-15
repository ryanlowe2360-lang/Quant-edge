"use client";

import { useState, useEffect, useCallback } from "react";
import { Database, RefreshCw, Eye, Calendar, TrendingUp, TrendingDown } from "lucide-react";

interface SnapshotContract {
  type: "CALL" | "PUT";
  strike: number;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  oi: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

interface Snapshot {
  symbol: string;
  stock_price: number;
  expiry: string;
  dte: number;
  snapshot_json: SnapshotContract[];
  recorded_at: string;
}

export default function OptionsSnapshotsViewer() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [stats, setStats] = useState({ totalRecords: 0, daysRecorded: 0, needsMigration: false });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedSymbol
        ? `/api/record-options?symbol=${selectedSymbol}&limit=100`
        : `/api/record-options?limit=100`;
      const res = await fetch(url);
      const data = await res.json();
      setSnapshots(data.snapshots || []);
      setStats({
        totalRecords: data.totalRecords || 0,
        daysRecorded: data.daysRecorded || 0,
        needsMigration: data.needsMigration || false,
      });
    } catch (err) {
      console.error("Snapshot fetch error:", err);
    }
    setLoading(false);
  }, [selectedSymbol]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get unique symbols
  const symbols = [...new Set(snapshots.map((s) => s.symbol))].sort();

  // Group snapshots by date for the selected symbol
  const grouped = snapshots.reduce<Record<string, Snapshot[]>>((acc, snap) => {
    const date = snap.recorded_at?.slice(0, 10) || "unknown";
    if (!acc[date]) acc[date] = [];
    acc[date].push(snap);
    return acc;
  }, {});

  if (stats.needsMigration) {
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-5 h-5 text-accent-amber" />
          <span className="font-display font-semibold text-text-primary">Options Snapshots</span>
        </div>
        <div className="bg-accent-amber-dim border border-accent-amber/20 rounded-lg p-4">
          <p className="text-accent-amber text-sm font-mono mb-2">Migration Required</p>
          <p className="text-text-secondary text-xs">
            The <code className="text-accent-amber">options_snapshots</code> table hasn't been
            created in Supabase yet. Run the migration SQL from{" "}
            <code className="text-accent-blue">supabase-migration-options-snapshots.sql</code>{" "}
            in your Supabase SQL Editor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <Database className="w-4 h-4 text-accent-blue" />
        <span className="font-display font-semibold text-text-primary text-sm">
          Recorded Options Data
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] font-mono text-text-muted">
            {stats.totalRecords} records • {stats.daysRecorded} days
          </span>
          <button
            onClick={fetchData}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Symbol filter */}
      {symbols.length > 0 && (
        <div className="px-4 py-2 border-b border-bg-border flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedSymbol(null)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
              !selectedSymbol
                ? "bg-accent-blue text-white"
                : "bg-bg-hover text-text-muted hover:text-text-primary"
            }`}
          >
            ALL
          </button>
          {symbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                selectedSymbol === sym
                  ? "bg-accent-blue text-white"
                  : "bg-bg-hover text-text-muted hover:text-text-primary"
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="p-6 text-center">
          <RefreshCw className="w-5 h-5 text-text-muted animate-spin mx-auto mb-2" />
          <p className="text-text-muted text-xs font-mono">Loading snapshots...</p>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="p-8 text-center">
          <Database className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary text-sm mb-1">No options snapshots recorded yet.</p>
          <p className="text-text-muted text-xs font-mono">
            Data is recorded every 5 minutes while the app runs during market hours.
            Check back after a trading session.
          </p>
        </div>
      ) : selectedSnapshot ? (
        // Detailed contract view
        <div>
          <button
            onClick={() => setSelectedSnapshot(null)}
            className="px-4 py-2 text-xs font-mono text-accent-blue hover:underline"
          >
            ← Back to list
          </button>
          <div className="px-4 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-text-primary">
                {selectedSnapshot.symbol}
              </span>
              <span className="text-text-muted text-xs font-mono">
                ${selectedSnapshot.stock_price?.toFixed(2)} • {selectedSnapshot.expiry} • {selectedSnapshot.dte} DTE
              </span>
            </div>
            <span className="text-[10px] font-mono text-text-muted">
              Recorded {new Date(selectedSnapshot.recorded_at).toLocaleString()}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-bg-border text-text-muted">
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Strike</th>
                  <th className="px-3 py-2 text-right">Bid</th>
                  <th className="px-3 py-2 text-right">Ask</th>
                  <th className="px-3 py-2 text-right">Vol</th>
                  <th className="px-3 py-2 text-right">OI</th>
                  <th className="px-3 py-2 text-right">Delta</th>
                  <th className="px-3 py-2 text-right">IV</th>
                  <th className="px-3 py-2 text-right">Theta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-border">
                {(selectedSnapshot.snapshot_json || [])
                  .sort((a, b) => a.strike - b.strike)
                  .map((c, i) => (
                    <tr key={i} className="hover:bg-bg-hover">
                      <td className="px-3 py-1.5">
                        <span className={c.type === "CALL" ? "text-accent-green" : "text-accent-red"}>
                          {c.type}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-text-primary">${c.strike}</td>
                      <td className="px-3 py-1.5 text-right">${c.bid?.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right">${c.ask?.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right">{c.volume || 0}</td>
                      <td className="px-3 py-1.5 text-right">{c.oi || 0}</td>
                      <td className="px-3 py-1.5 text-right">{c.delta?.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right">{(c.iv * 100)?.toFixed(0)}%</td>
                      <td className="px-3 py-1.5 text-right text-accent-red">{c.theta?.toFixed(3)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Snapshot list grouped by date
        <div className="divide-y divide-bg-border max-h-[500px] overflow-y-auto">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, snaps]) => (
              <div key={date}>
                <div className="px-4 py-2 bg-bg-secondary flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-text-muted" />
                  <span className="text-[10px] font-mono text-text-muted font-bold uppercase">
                    {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted ml-auto">
                    {snaps.length} snapshot{snaps.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-bg-border/50">
                  {snaps.map((snap, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSnapshot(snap)}
                      className="w-full px-4 py-2 flex items-center gap-3 hover:bg-bg-hover transition-colors text-left"
                    >
                      <span className="font-mono font-bold text-text-primary text-xs w-12">
                        {snap.symbol}
                      </span>
                      <span className="text-text-muted text-[10px] font-mono">
                        ${snap.stock_price?.toFixed(2)}
                      </span>
                      <span className="text-text-muted text-[10px] font-mono">
                        {snap.expiry} ({snap.dte}d)
                      </span>
                      <span className="text-text-muted text-[10px] font-mono">
                        {(snap.snapshot_json || []).length} contracts
                      </span>
                      <Eye className="w-3 h-3 text-text-muted ml-auto" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
