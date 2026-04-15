// ============================================================
// GET /api/sentiment
// Fetches market news and sentiment using free APIs
// Returns: Fear & Greed index, market headlines, AI interpretation
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const TRADIER_BASE = process.env.TRADIER_SANDBOX === "true"
  ? "https://sandbox.tradier.com/v1"
  : "https://api.tradier.com/v1";

interface MarketSentiment {
  fearGreedIndex: number;       // 0-100 (0 = extreme fear, 100 = extreme greed)
  fearGreedLabel: string;
  marketMood: "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";
  headlines: { title: string; source: string; time: string; sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" }[];
  signalAdjustment: number;     // how much to adjust signal scores based on sentiment
  tradingBias: string;          // human-readable trading recommendation
  timestamp: string;
}

/**
 * Fetch real CNN Fear & Greed Index
 * Falls back to VIX/SPY estimate if CNN is unavailable
 */
async function fetchFearGreed(vixLevel: number, spyChangePercent: number): Promise<{ index: number; label: string; mood: MarketSentiment["marketMood"] }> {
  // Try CNN Fear & Greed API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const score = Math.round(data?.fear_and_greed?.score || 0);
      if (score > 0) {
        let label = "Neutral";
        let mood: MarketSentiment["marketMood"] = "NEUTRAL";
        if (score >= 75) { label = "Extreme Greed"; mood = "EXTREME_GREED"; }
        else if (score >= 55) { label = "Greed"; mood = "GREED"; }
        else if (score >= 45) { label = "Neutral"; mood = "NEUTRAL"; }
        else if (score >= 25) { label = "Fear"; mood = "FEAR"; }
        else { label = "Extreme Fear"; mood = "EXTREME_FEAR"; }
        return { index: score, label, mood };
      }
    }
  } catch { /* fall through to estimate */ }

  // Fallback: estimate from VIX + SPY
  let vixScore = 0;
  if (vixLevel < 12) vixScore = 95;
  else if (vixLevel < 15) vixScore = 80;
  else if (vixLevel < 18) vixScore = 65;
  else if (vixLevel < 22) vixScore = 50;
  else if (vixLevel < 28) vixScore = 35;
  else if (vixLevel < 35) vixScore = 20;
  else vixScore = 5;

  let spyScore = 50;
  if (spyChangePercent > 2) spyScore = 90;
  else if (spyChangePercent > 1) spyScore = 75;
  else if (spyChangePercent > 0.3) spyScore = 60;
  else if (spyChangePercent > -0.3) spyScore = 50;
  else if (spyChangePercent > -1) spyScore = 35;
  else if (spyChangePercent > -2) spyScore = 20;
  else spyScore = 5;

  const index = Math.round(vixScore * 0.5 + spyScore * 0.5);
  let label = "Neutral";
  let mood: MarketSentiment["marketMood"] = "NEUTRAL";
  if (index >= 75) { label = "Extreme Greed"; mood = "EXTREME_GREED"; }
  else if (index >= 55) { label = "Greed"; mood = "GREED"; }
  else if (index >= 45) { label = "Neutral"; mood = "NEUTRAL"; }
  else if (index >= 25) { label = "Fear"; mood = "FEAR"; }
  else { label = "Extreme Fear"; mood = "EXTREME_FEAR"; }

  return { index, label, mood };
}

/**
 * Simple headline sentiment scoring based on keywords
 */
function scoreHeadline(title: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const lower = title.toLowerCase();

  const bullishWords = ["rally", "surge", "jump", "gain", "soar", "record", "boom", "bull",
    "ceasefire", "peace", "deal", "agreement", "stimulus", "cut rates", "rate cut",
    "beats expectations", "strong earnings", "upgrade", "buy", "breakout", "recovery"];

  const bearishWords = ["crash", "plunge", "drop", "fall", "sink", "bear", "recession",
    "war", "conflict", "tariff", "sanctions", "inflation", "rate hike", "layoffs",
    "miss", "downgrade", "sell", "warning", "crisis", "default", "bankruptcy"];

  let bullCount = 0;
  let bearCount = 0;

  for (const word of bullishWords) {
    if (lower.includes(word)) bullCount++;
  }
  for (const word of bearishWords) {
    if (lower.includes(word)) bearCount++;
  }

  if (bullCount > bearCount) return "BULLISH";
  if (bearCount > bullCount) return "BEARISH";
  return "NEUTRAL";
}

export async function GET(req: NextRequest) {
  try {
    // Get VIX and SPY from Tradier
    let vixLevel = 20;
    let spyChange = 0;

    const tradierKey = process.env.TRADIER_API_KEY;
    if (tradierKey) {
      try {
        const quotesRes = await fetch(
          `${TRADIER_BASE}/markets/quotes?symbols=VIX,SPY&greeks=false`,
          {
            headers: {
              Authorization: `Bearer ${tradierKey}`,
              Accept: "application/json",
            },
          }
        );

        if (quotesRes.ok) {
          const data = await quotesRes.json();
          const quotes = data?.quotes?.quote;
          if (Array.isArray(quotes)) {
            for (const q of quotes) {
              if (q.symbol === "VIX") vixLevel = q.last || q.close || 20;
              if (q.symbol === "SPY") spyChange = q.change_percentage || 0;
            }
          } else if (quotes) {
            if (quotes.symbol === "VIX") vixLevel = quotes.last || quotes.close || 20;
            if (quotes.symbol === "SPY") spyChange = quotes.change_percentage || 0;
          }
        }
      } catch (err) {
        console.error("Tradier quotes error:", err);
      }
    }

    // Calculate Fear & Greed
    const fg = await fetchFearGreed(vixLevel, spyChange);

    // Fetch market news from Tradier
    const headlines: MarketSentiment["headlines"] = [];

    if (tradierKey) {
      try {
        // Get general market news
        const newsRes = await fetch(
          `${TRADIER_BASE}/markets/news?q=stock+market&limit=10`,
          {
            headers: {
              Authorization: `Bearer ${tradierKey}`,
              Accept: "application/json",
            },
          }
        );

        if (newsRes.ok) {
          const newsData = await newsRes.json();
          const articles = newsData?.articles?.article || newsData?.stories?.story || [];
          const articleList = Array.isArray(articles) ? articles : [articles];

          for (const article of articleList.slice(0, 10)) {
            if (article?.title) {
              headlines.push({
                title: article.title,
                source: article.source || "Market News",
                time: article.date || new Date().toISOString(),
                sentiment: scoreHeadline(article.title),
              });
            }
          }
        }
      } catch (err) {
        console.error("News fetch error:", err);
      }
    }

    // Calculate signal adjustment based on sentiment
    let signalAdjustment = 0;
    let tradingBias = "Normal conditions — standard parameters apply.";

    const bullishHeadlines = headlines.filter((h) => h.sentiment === "BULLISH").length;
    const bearishHeadlines = headlines.filter((h) => h.sentiment === "BEARISH").length;

    if (fg.mood === "EXTREME_GREED" || (bullishHeadlines >= 5 && spyChange > 1)) {
      signalAdjustment = -5; // Lower threshold slightly — ride the momentum
      tradingBias = "Strong bullish sentiment — favor momentum entries, trail stops wider.";
    } else if (fg.mood === "GREED" || bullishHeadlines > bearishHeadlines) {
      signalAdjustment = 0;
      tradingBias = "Moderately bullish — standard parameters, lean toward calls.";
    } else if (fg.mood === "FEAR") {
      signalAdjustment = 5; // Raise threshold — be more selective
      tradingBias = "Fearful market — be selective, only take highest-conviction signals.";
    } else if (fg.mood === "EXTREME_FEAR") {
      signalAdjustment = 10;
      tradingBias = "Extreme fear — consider sitting out or only trading reversals.";
    }

    const sentiment: MarketSentiment = {
      fearGreedIndex: fg.index,
      fearGreedLabel: fg.label,
      marketMood: fg.mood,
      headlines,
      signalAdjustment,
      tradingBias,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(sentiment);
  } catch (error: any) {
    console.error("Sentiment API error:", error);
    return NextResponse.json(
      { error: "Sentiment fetch failed", details: error.message },
      { status: 500 }
    );
  }
}
