// ============================================================
// QUANT EDGE — Database Sync Hook
// Syncs Zustand (localStorage) with Supabase on load
// and pushes changes to Supabase when state changes
// ============================================================

"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

/**
 * On mount: pull watchlist + settings from Supabase into Zustand.
 * Zustand localStorage remains the fast local cache.
 * Writes go to both localStorage (automatic via Zustand persist) and Supabase (via API).
 */
export function useDbSync() {
  const hasSynced = useRef(false);
  const {
    watchlist,
    setStartingBalance,
    setSignalThreshold,
  } = useStore();

  // Pull from Supabase on first load
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    // Sync watchlist from DB
    fetch("/api/db/watchlist")
      .then((res) => res.json())
      .then((data) => {
        if (data.watchlist && data.watchlist.length > 0) {
          const store = useStore.getState();
          // Merge DB watchlist into local — DB is source of truth
          for (const item of data.watchlist) {
            const exists = store.watchlist.find((w) => w.symbol === item.symbol);
            if (!exists) {
              store.addToWatchlist({
                symbol: item.symbol,
                name: item.symbol,
                addedAt: item.date_added || item.created_at,
                quantRank: item.quant_rank,
                quantScore: item.quant_score,
              });
            }
          }
        }
      })
      .catch((err) => console.warn("DB watchlist sync failed (offline?):", err));

    // Sync settings from DB
    fetch("/api/db/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.balance) setStartingBalance(data.balance);
        if (data.settings?.signal_threshold) {
          setSignalThreshold(parseInt(data.settings.signal_threshold));
        }
      })
      .catch((err) => console.warn("DB settings sync failed (offline?):", err));
  }, []);

  return { synced: hasSynced.current };
}

/**
 * Push a watchlist change to Supabase (call after Zustand update)
 */
export async function syncWatchlistAdd(symbol: string, quantRank?: number, quantScore?: number) {
  try {
    await fetch("/api/db/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, quantRank, quantScore }),
    });
  } catch (err) {
    console.warn("Failed to sync watchlist add to DB:", err);
  }
}

export async function syncWatchlistRemove(symbol: string) {
  try {
    await fetch(`/api/db/watchlist?symbol=${symbol}`, { method: "DELETE" });
  } catch (err) {
    console.warn("Failed to sync watchlist remove to DB:", err);
  }
}

/**
 * Push a closed trade to Supabase
 */
export async function syncTrade(trade: any, type: "user" | "system") {
  try {
    await fetch("/api/db/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...trade }),
    });
  } catch (err) {
    console.warn("Failed to sync trade to DB:", err);
  }
}

/**
 * Push settings change to Supabase
 */
export async function syncSettings(settings: Record<string, any>, balance?: number) {
  try {
    await fetch("/api/db/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, balance }),
    });
  } catch (err) {
    console.warn("Failed to sync settings to DB:", err);
  }
}

/**
 * Log a signal to Supabase for historical tracking
 */
export async function syncSignal(signal: any) {
  try {
    await fetch("/api/db/signals-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
    });
  } catch (err) {
    console.warn("Failed to sync signal to DB:", err);
  }
}
