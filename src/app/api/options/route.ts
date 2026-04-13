// ============================================================
// GET /api/options?symbol=AAPL
// GET /api/options?symbols=AAPL,MSFT&mode=scan (batch liquidity scan)
// Fetches options chain from Tradier and runs recommendation engine
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getNearestExpirations, getMultiExpirationChain, quickLiquidityCheck } from "@/lib/tradier";
import { recommendContract, summarizeChain, DEFAULT_OPTIONS_SETTINGS } from "@/lib/options";
import { OptionsSettings } from "@/lib/types";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const symbols = req.nextUrl.searchParams.get("symbols");
  const mode = req.nextUrl.searchParams.get("mode") || "recommend";
  const priceParam = req.nextUrl.searchParams.get("price");

  // Settings overrides from query params
  const budget = req.nextUrl.searchParams.get("budget");
  const settings: OptionsSettings = {
    ...DEFAULT_OPTIONS_SETTINGS,
    ...(budget ? { maxBudgetPerTrade: parseFloat(budget) } : {}),
  };

  try {
    // ── Batch scan mode: quick liquidity check for multiple symbols ──
    if (mode === "scan" && symbols) {
      const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase());

      const results: Record<string, {
        hasOptions: boolean;
        avgOI: number;
        avgSpread: number;
        callCount: number;
        liquidityGrade: string;
      }> = {};

      // Process in parallel (batches of 5 to avoid rate limits)
      for (let i = 0; i < symbolList.length; i += 5) {
        const batch = symbolList.slice(i, i + 5);
        const checks = await Promise.all(
          batch.map(async (sym) => {
            const check = await quickLiquidityCheck(sym);
            let grade = "NONE";
            if (check.hasOptions) {
              if (check.avgOI >= 200 && check.avgSpread <= 15) grade = "HIGH";
              else if (check.avgOI >= 50 && check.avgSpread <= 25) grade = "MEDIUM";
              else if (check.avgOI > 0) grade = "LOW";
            }
            return { sym, ...check, liquidityGrade: grade };
          })
        );

        for (const c of checks) {
          results[c.sym] = {
            hasOptions: c.hasOptions,
            avgOI: Math.round(c.avgOI),
            avgSpread: Math.round(c.avgSpread * 10) / 10,
            callCount: c.callCount,
            liquidityGrade: c.liquidityGrade,
          };
        }

        // Small delay between batches to be polite to the API
        if (i + 5 < symbolList.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      return NextResponse.json({
        scan: results,
        scannedAt: new Date().toISOString(),
      });
    }

    // ── Single symbol recommendation mode ──
    if (!symbol) {
      return NextResponse.json(
        { error: "symbol parameter required" },
        { status: 400 }
      );
    }

    const sym = symbol.toUpperCase();
    const currentPrice = priceParam ? parseFloat(priceParam) : 0;

    // Get nearest expirations (within 7 days)
    const expirations = await getNearestExpirations(sym, 7, 4);

    if (expirations.length === 0) {
      return NextResponse.json({
        symbol: sym,
        recommendation: {
          symbol: sym,
          liquidityGrade: "NONE",
          bestContract: null,
          alternatives: [],
          reason: "No options expirations found within 7 days. This stock may not have weekly options.",
          estimatedCost: 0,
          spreadCost: 0,
          maxRisk: 0,
          timestamp: new Date().toISOString(),
        },
        chain: [],
        summary: null,
        expirations: [],
      });
    }

    // Fetch chains for all nearby expirations (calls only for bullish strategy)
    const chain = await getMultiExpirationChain(
      sym,
      expirations,
      settings.preferCalls ? "call" : undefined
    );

    // Generate summary and recommendation
    const summary = summarizeChain(sym, chain, expirations);
    const recommendation = recommendContract(sym, chain, currentPrice, 500, undefined, settings);

    return NextResponse.json({
      symbol: sym,
      recommendation,
      chain: chain.slice(0, 50), // limit response size
      summary,
      expirations,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Options API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch options data", details: error.message },
      { status: 500 }
    );
  }
}
