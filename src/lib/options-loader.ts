// ============================================================
// QUANT EDGE — Recorded Options Data Loader
// Loads real options snapshots from JSONL files for backtesting
// After 1-2 weeks of recording, replaces BS simulation with real data
// ============================================================

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "options-snapshots");

export interface RecordedSnapshot {
  timestamp: string;
  symbol: string;
  stockPrice: number;
  contracts: {
    symbol: string;
    type: "CALL" | "PUT";
    strike: number;
    expiry: string;
    bid: number;
    ask: number;
    last: number;
    volume: number;
    openInterest: number;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    impliedVolatility: number;
    dte: number;
  }[];
}

/**
 * Load all recorded snapshots for a date range
 */
export function loadRecordedData(
  startDate: string,  // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
): RecordedSnapshot[] {
  if (!fs.existsSync(DATA_DIR)) return [];

  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .filter((f) => {
      const date = f.replace("options-", "").replace(".jsonl", "");
      return date >= startDate && date <= endDate;
    })
    .sort();

  const snapshots: RecordedSnapshot[] = [];

  for (const file of files) {
    const filepath = path.join(DATA_DIR, file);
    const lines = fs.readFileSync(filepath, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        snapshots.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
  }

  return snapshots;
}

/**
 * Find the best matching options contract for a trade entry
 * Matches by symbol, approximate timestamp, and budget
 */
export function findMatchingContract(
  snapshots: RecordedSnapshot[],
  symbol: string,
  timestamp: string,        // ISO timestamp of trade entry
  budget: number,            // max contract cost
  preferredDelta: [number, number],  // [minDelta, maxDelta]
  preferCalls: boolean = true
): {
  contract: RecordedSnapshot["contracts"][0] | null;
  snapshotTime: string;
  stockPrice: number;
} | null {
  // Find snapshots for this symbol near this timestamp
  const targetTime = new Date(timestamp).getTime();
  const maxDiff = 10 * 60 * 1000; // 10 minute window

  let bestSnapshot: RecordedSnapshot | null = null;
  let bestDiff = Infinity;

  for (const snap of snapshots) {
    if (snap.symbol !== symbol) continue;
    const diff = Math.abs(new Date(snap.timestamp).getTime() - targetTime);
    if (diff < bestDiff && diff < maxDiff) {
      bestDiff = diff;
      bestSnapshot = snap;
    }
  }

  if (!bestSnapshot || bestSnapshot.contracts.length === 0) return null;

  // Filter contracts by budget, delta, and type
  const maxAsk = budget / 100;
  const candidates = bestSnapshot.contracts
    .filter((c) => {
      if (preferCalls && c.type !== "CALL") return false;
      if (!preferCalls && c.type !== "PUT") return false;
      if (c.ask > maxAsk || c.ask <= 0) return false;
      const absDelta = Math.abs(c.delta);
      if (absDelta < preferredDelta[0] || absDelta > preferredDelta[1]) return false;
      return true;
    })
    .sort((a, b) => {
      // Prefer contracts with delta closest to 0.30 (sweet spot)
      const aDiff = Math.abs(Math.abs(a.delta) - 0.30);
      const bDiff = Math.abs(Math.abs(b.delta) - 0.30);
      return aDiff - bDiff;
    });

  if (candidates.length === 0) return null;

  return {
    contract: candidates[0],
    snapshotTime: bestSnapshot.timestamp,
    stockPrice: bestSnapshot.stockPrice,
  };
}

/**
 * Find exit price for a contract at a later timestamp
 */
export function findExitPrice(
  snapshots: RecordedSnapshot[],
  symbol: string,
  contractSymbol: string,
  timestamp: string
): { price: number; bid: number; ask: number } | null {
  const targetTime = new Date(timestamp).getTime();
  const maxDiff = 10 * 60 * 1000;

  let bestSnapshot: RecordedSnapshot | null = null;
  let bestDiff = Infinity;

  for (const snap of snapshots) {
    if (snap.symbol !== symbol) continue;
    const diff = Math.abs(new Date(snap.timestamp).getTime() - targetTime);
    if (diff < bestDiff && diff < maxDiff) {
      bestDiff = diff;
      bestSnapshot = snap;
    }
  }

  if (!bestSnapshot) return null;

  const contract = bestSnapshot.contracts.find((c) => c.symbol === contractSymbol);
  if (!contract) return null;

  return {
    price: contract.last || (contract.bid + contract.ask) / 2,
    bid: contract.bid,
    ask: contract.ask,
  };
}

/**
 * Get recording stats
 */
export function getRecordingStats(): {
  daysRecorded: number;
  totalSnapshots: number;
  symbols: string[];
  dateRange: { start: string; end: string } | null;
  readyForBacktest: boolean;
} {
  if (!fs.existsSync(DATA_DIR)) {
    return { daysRecorded: 0, totalSnapshots: 0, symbols: [], dateRange: null, readyForBacktest: false };
  }

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".jsonl")).sort();
  if (files.length === 0) {
    return { daysRecorded: 0, totalSnapshots: 0, symbols: [], dateRange: null, readyForBacktest: false };
  }

  const symbolSet = new Set<string>();
  let totalSnapshots = 0;

  for (const file of files) {
    const lines = fs.readFileSync(path.join(DATA_DIR, file), "utf-8").split("\n").filter(Boolean);
    totalSnapshots += lines.length;
    for (const line of lines) {
      try {
        const snap = JSON.parse(line);
        if (snap.symbol) symbolSet.add(snap.symbol);
      } catch { /* skip */ }
    }
  }

  const dates = files.map((f) => f.replace("options-", "").replace(".jsonl", ""));

  return {
    daysRecorded: files.length,
    totalSnapshots,
    symbols: Array.from(symbolSet),
    dateRange: { start: dates[0], end: dates[dates.length - 1] },
    readyForBacktest: files.length >= 5, // Need at least 5 days
  };
}
