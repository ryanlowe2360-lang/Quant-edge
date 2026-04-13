// ============================================================
// POST /api/record-options
// Snapshots real-time options data from Tradier and saves to disk
// Records: price, Greeks, bid/ask, volume, OI for each contract
// After 1-2 weeks, this data can be used for realistic backtesting
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getExpirations, getOptionsChain } from "@/lib/tradier";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "options-snapshots");

interface OptionsSnapshot {
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = body.symbols || [];
    const stockPrices: Record<string, number> = body.prices || {};

    if (symbols.length === 0) {
      return NextResponse.json({ error: "No symbols provided" }, { status: 400 });
    }

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const today = new Date().toISOString().slice(0, 10);
    const snapshots: OptionsSnapshot[] = [];
    let recorded = 0;

    // Process each symbol (limit to avoid rate limits)
    for (const sym of symbols.slice(0, 10)) {
      try {
        const expirations = await getExpirations(sym);
        if (expirations.length === 0) continue;

        // Get closest 3 expirations (0DTE, next day, weekly)
        const nearExpiries = expirations.slice(0, 3);

        for (const expiry of nearExpiries) {
          const chain = await getOptionsChain(sym, expiry);
          if (!chain || chain.length === 0) continue;

          const now = new Date();
          const expiryDate = new Date(expiry + "T16:00:00");
          const dte = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000));

          const snapshot: OptionsSnapshot = {
            timestamp: now.toISOString(),
            symbol: sym,
            stockPrice: stockPrices[sym] || 0,
            contracts: chain.map((c: any) => ({
              symbol: c.symbol || "",
              type: c.type === "put" ? "PUT" : "CALL",
              strike: c.strike || 0,
              expiry,
              bid: c.bid || 0,
              ask: c.ask || 0,
              last: c.last || 0,
              volume: c.volume || 0,
              openInterest: c.openInterest || c.open_interest || 0,
              delta: c.delta || c.greeks?.delta || 0,
              gamma: c.gamma || c.greeks?.gamma || 0,
              theta: c.theta || c.greeks?.theta || 0,
              vega: c.vega || c.greeks?.vega || 0,
              impliedVolatility: c.impliedVolatility || c.greeks?.mid_iv || 0,
              dte,
            })),
          };

          snapshots.push(snapshot);
          recorded++;
        }

        // Small delay between symbols to avoid Tradier rate limits
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`Options recording error for ${sym}:`, err);
      }
    }

    // Append to today's file
    const filename = `options-${today}.jsonl`;
    const filepath = path.join(DATA_DIR, filename);

    const lines = snapshots.map((s) => JSON.stringify(s)).join("\n") + "\n";
    fs.appendFileSync(filepath, lines);

    // Get file stats
    const stats = fs.existsSync(filepath) ? fs.statSync(filepath) : null;
    const fileSizeKB = stats ? Math.round(stats.size / 1024) : 0;

    return NextResponse.json({
      recorded,
      snapshots: snapshots.length,
      symbols: symbols.length,
      file: filename,
      fileSizeKB,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Options recording error:", error);
    return NextResponse.json(
      { error: "Recording failed", details: error.message },
      { status: 500 }
    );
  }
}

// GET — return recording stats
export async function GET() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return NextResponse.json({ files: [], totalSizeKB: 0 });
    }

    const files = fs.readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const stats = fs.statSync(path.join(DATA_DIR, f));
        const lines = fs.readFileSync(path.join(DATA_DIR, f), "utf-8").split("\n").filter(Boolean);
        return {
          filename: f,
          sizeKB: Math.round(stats.size / 1024),
          records: lines.length,
          date: f.replace("options-", "").replace(".jsonl", ""),
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const totalSizeKB = files.reduce((sum, f) => sum + f.sizeKB, 0);

    return NextResponse.json({
      files,
      totalSizeKB,
      totalRecords: files.reduce((sum, f) => sum + f.records, 0),
      daysRecorded: files.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
