"use client";

import { useState, useEffect } from "react";
import { Archive, ChevronDown, ChevronRight, Calendar, Hash, TrendingUp } from "lucide-react";

interface WeekData {
  weekStart: string;
  weekEnd: string;
  tickers: Array<{
    symbol: string;
    quantRank: number | null;
    quantScore: number | null;
    active: boolean;
  }>;
}

export default function WatchlistArchive() {
  const [history, setHistory] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/db/watchlist-history")
      .then((res) => res.json())
      .then((data) => {
        setHistory(data.history || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-bg-hover rounded w-32 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-bg-hover rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-bg-card border border-bg-border rounded-xl p-8 text-center">
        <Archive className="w-8 h-8 text-text-muted mx-auto mb-3" />
        <p className="text-text-secondary text-sm">
          No archived watchlists yet. When you clear and reload your weekly picks,
          previous lists are automatically saved here.
        </p>
      </div>
    );
  }

  // Compute overlap between consecutive weeks
  function getOverlap(current: WeekData, previous: WeekData): string[] {
    const prevSymbols = new Set(previous.tickers.map((t) => t.symbol));
    return current.tickers.filter((t) => prevSymbols.has(t.symbol)).map((t) => t.symbol);
  }

  return (
    <div className="bg-bg-card border border-bg-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <Archive className="w-4 h-4 text-accent-blue" />
        <span className="font-display font-semibold text-text-primary text-sm">
          Watchlist Archive
        </span>
        <span className="text-text-muted text-xs font-mono ml-auto">
          {history.length} week{history.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="divide-y divide-bg-border">
        {history.map((week, idx) => {
          const isExpanded = expandedWeek === week.weekStart;
          const overlap = idx < history.length - 1 ? getOverlap(week, history[idx + 1]) : [];
          const newPicks = week.tickers.filter((t) => !overlap.includes(t.symbol));

          return (
            <div key={week.weekStart}>
              <button
                onClick={() => setExpandedWeek(isExpanded ? null : week.weekStart)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-hover transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                )}
                <Calendar className="w-3.5 h-3.5 text-accent-blue flex-shrink-0" />
                <span className="font-mono text-xs text-text-primary">
                  {formatWeek(week.weekStart)}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] font-mono text-text-muted">
                    {week.tickers.length} tickers
                  </span>
                  {newPicks.length > 0 && idx < history.length - 1 && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent-green-dim text-accent-green">
                      +{newPicks.length} new
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
                    {week.tickers.map((ticker) => {
                      const isNew = !overlap.includes(ticker.symbol);
                      return (
                        <div
                          key={ticker.symbol}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-mono flex items-center justify-between ${
                            ticker.active
                              ? "bg-accent-green-dim border border-accent-green/20 text-accent-green"
                              : isNew && idx < history.length - 1
                              ? "bg-accent-blue-dim border border-accent-blue/20 text-accent-blue"
                              : "bg-bg-hover border border-bg-border text-text-secondary"
                          }`}
                        >
                          <span className="font-bold">{ticker.symbol}</span>
                          {ticker.quantRank && (
                            <span className="text-[9px] opacity-70">#{ticker.quantRank}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {overlap.length > 0 && idx < history.length - 1 && (
                    <div className="mt-2 text-[10px] font-mono text-text-muted">
                      {overlap.length} carried over from prior week: {overlap.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatWeek(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
