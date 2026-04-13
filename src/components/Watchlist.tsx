"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { WatchlistStock } from "@/lib/types";
import { Plus, Trash2, Upload, X, RotateCcw, Hash } from "lucide-react";
import { syncWatchlistAdd, syncWatchlistRemove } from "@/hooks/useDbSync";

export default function Watchlist() {
  const { watchlist, addToWatchlist, removeFromWatchlist, quotes, signals, optionsLiquidity } = useStore();
  const [input, setInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [rankInput, setRankInput] = useState("");

  // Single add with optional rank
  const handleAdd = () => {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    const rank = rankInput ? parseInt(rankInput) : undefined;
    addToWatchlist({
      symbol: sym, name: sym, addedAt: new Date().toISOString(),
      quantRank: rank,
    });
    syncWatchlistAdd(sym, rank);
    setInput(""); setRankInput("");
  };

  // Bulk add — supports "AAPL, MSFT, NVDA" or "1. AAPL\n2. MSFT" or "AAPL 95\nMSFT 88"
  const handleBulkAdd = () => {
    const lines = bulkInput.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      // Try to parse "AAPL 95" or "1. AAPL" or just "AAPL"
      const match = line.match(/^(?:\d+[.\s)]*)?([A-Za-z]{1,5})[\s]*(\d+)?/);
      if (match) {
        const sym = match[1].toUpperCase();
        const score = match[2] ? parseFloat(match[2]) : undefined;
        const rank = lines.indexOf(line) + 1;
        addToWatchlist({
          symbol: sym, name: sym, addedAt: new Date().toISOString(),
          quantRank: rank, quantScore: score,
        });
        syncWatchlistAdd(sym, rank, score);
      }
    }
    setBulkInput(""); setShowBulk(false);
  };

  // Clear all
  const handleClearAll = () => {
    if (!confirm("Clear all tickers from watchlist? They'll be archived for history.")) return;
    for (const stock of watchlist) {
      removeFromWatchlist(stock.symbol);
      syncWatchlistRemove(stock.symbol);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
    <div className="space-y-6">
      {/* Add Stock */}
      <div className="bg-bg-card border border-bg-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-text-primary">Add to Watchlist</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowBulk(!showBulk)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-hover border border-bg-border text-text-secondary text-xs font-mono hover:text-text-primary transition-all">
              <Upload className="w-3 h-3" /> Bulk Paste
            </button>
            {watchlist.length > 0 && (
              <button onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-red-dim border border-accent-red/30 text-accent-red text-xs font-mono hover:bg-accent-red/20 transition-all">
                <RotateCcw className="w-3 h-3" /> Clear All
              </button>
            )}
          </div>
        </div>

        {/* Single add */}
        <div className="flex gap-2 mb-3">
          <input
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Ticker (e.g. NVDA)"
            className="flex-1 px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-green/50"
          />
          <input
            value={rankInput} onChange={(e) => setRankInput(e.target.value)}
            placeholder="Rank #"
            type="number"
            className="w-20 px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-green/50"
          />
          <button onClick={handleAdd}
            className="px-4 py-2 bg-accent-green text-black rounded-lg font-mono font-bold text-sm hover:bg-accent-green/80 transition-all">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Bulk paste */}
        {showBulk && (
          <div className="mt-3 border-t border-bg-border pt-3">
            <p className="text-xs text-text-muted font-mono mb-2">
              Paste your ranked tickers — one per line. Supports: "AAPL", "1. AAPL", "AAPL 95" (with score)
            </p>
            <textarea
              value={bulkInput} onChange={(e) => setBulkInput(e.target.value)}
              placeholder={"NVDA 98\nAAPL 92\nMSFT 87\nTSLA 85\nAMD 82"}
              rows={6}
              className="w-full px-3 py-2 bg-bg-primary border border-bg-border rounded-lg text-sm font-mono text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent-green/50"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleBulkAdd}
                className="px-4 py-2 bg-accent-green text-black rounded-lg font-mono font-bold text-sm hover:bg-accent-green/80 transition-all">
                Add {bulkInput.split(/[\n,;]+/).filter((s) => s.trim()).length} Tickers
              </button>
              <button onClick={() => { setBulkInput(""); setShowBulk(false); }}
                className="px-3 py-2 text-text-muted text-sm font-mono hover:text-text-primary transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Watchlist count */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-text-primary">
          Watchlist ({watchlist.length}/30)
        </h3>
        <span className="text-xs text-text-muted font-mono">
          Sorted by quant rank
        </span>
      </div>

      {/* Watchlist table */}
      {watchlist.length === 0 ? (
        <div className="bg-bg-card border border-bg-border rounded-xl p-12 text-center">
          <Upload className="w-10 h-10 text-text-muted mx-auto mb-4" />
          <h3 className="font-display font-bold text-text-primary text-lg mb-2">No tickers yet</h3>
          <p className="text-text-secondary text-sm">Add tickers above or use Bulk Paste to import your weekly quant picks.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {[...watchlist]
            .sort((a, b) => (a.quantRank || 999) - (b.quantRank || 999))
            .map((stock) => {
              const quote = quotes[stock.symbol];
              const signal = signals[stock.symbol];
              const liq = optionsLiquidity[stock.symbol];
              const score = signal?.score || 0;
              const dir = signal?.direction || "NEUTRAL";
              const conf = signal?.confidence || "LOW";
              const changeColor = (quote?.changePercent || 0) >= 0 ? "text-accent-green" : "text-accent-red";
              const scoreColor = score >= 70 ? "text-accent-green" : score >= 40 ? "text-accent-amber" : "text-text-muted";
              const dirColor = dir === "LONG" ? "text-accent-green" : dir === "SHORT" ? "text-accent-red" : "text-text-muted";

              return (
                <div key={stock.symbol} className="bg-bg-card border border-bg-border rounded-xl px-4 py-3 flex items-center gap-3 hover:border-accent-green/20 transition-all">
                  {/* Rank */}
                  <div className="w-8 text-center">
                    {stock.quantRank ? (
                      <span className="text-xs font-mono font-bold text-accent-blue">#{stock.quantRank}</span>
                    ) : (
                      <Hash className="w-3 h-3 text-text-muted mx-auto" />
                    )}
                  </div>

                  {/* Symbol + Price */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-text-primary">{stock.symbol}</span>
                      {stock.quantScore && (
                        <span className="text-[9px] font-mono text-text-muted bg-bg-hover px-1.5 py-0.5 rounded">
                          QS: {stock.quantScore}
                        </span>
                      )}
                    </div>
                    {quote && (
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-text-secondary">${quote.price.toFixed(2)}</span>
                        <span className={changeColor}>
                          {quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%
                        </span>
                        <span className="text-text-muted">Vol {(quote.volume / 1_000_000).toFixed(1)}M</span>
                      </div>
                    )}
                  </div>

                  {/* Signal */}
                  <div className="text-right">
                    <div className={`font-mono font-bold text-lg ${scoreColor}`}>{score}</div>
                    {dir !== "NEUTRAL" && (
                      <div className={`text-[10px] font-mono ${dirColor}`}>
                        {dir === "LONG" ? "CALL" : "PUT"} • {conf}
                      </div>
                    )}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => { removeFromWatchlist(stock.symbol); syncWatchlistRemove(stock.symbol); }}
                    className="p-1.5 rounded-lg hover:bg-accent-red-dim text-text-muted hover:text-accent-red transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
