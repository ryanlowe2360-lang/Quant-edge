import { NextRequest, NextResponse } from "next/server";

const TRADIER_BASE = process.env.TRADIER_SANDBOX === "true"
  ? "https://sandbox.tradier.com/v1"
  : "https://api.tradier.com/v1";

interface MarketSentiment {
  fearGreedIndex: number;
  fearGreedLabel: string;
  marketMood: "EXTREME_FEAR" | "FEAR" | "NEUTRAL" | "GREED" | "EXTREME_GREED";
  headlines: { title: string; source: string; time: string; sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" }[];
  signalAdjustment: number;
  tradingBias: string;
  timestamp: string;
}

function moodFromScore(score: number): MarketSentiment["marketMood"] {
  if (score >= 75) return "EXTREME_GREED";
  if (score >= 55) return "GREED";
  if (score >= 45) return "NEUTRAL";
  if (score >= 25) return "FEAR";
  return "EXTREME_FEAR";
}

function labelFromScore(score: number): string {
  if (score >= 75) return "Extreme Greed";
  if (score >= 55) return "Greed";
  if (score >= 45) return "Neutral";
  if (score >= 25) return "Fear";
  return "Extreme Fear";
}

async function fetchRealFearGreed(): Promise<{ index: number; label: string } | null> {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (res.ok) {
      const data = await res.json();
      const score = Math.round(data?.fear_and_greed?.score || 0);
      if (score > 0) return { index: score, label: labelFromScore(score) };
    }
  } catch {}

  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (res.ok) {
      const data = await res.json();
      const entry = data?.data?.[0];
      if (entry) return { index: parseInt(entry.value), label: entry.value_classification || "Neutral" };
    }
  } catch {}

  return null;
}

function estimateFearGreed(vixLevel: number, spyChange: number): { index: number; label: string } {
  let vixScore = vixLevel < 12 ? 95 : vixLevel < 15 ? 80 : vixLevel < 18 ? 65 :
    vixLevel < 22 ? 50 : vixLevel < 28 ? 35 : vixLevel < 35 ? 20 : 5;
  let spyScore = spyChange > 2 ? 90 : spyChange > 1 ? 75 : spyChange > 0.3 ? 60 :
    spyChange > -0.3 ? 50 : spyChange > -1 ? 35 : spyChange > -2 ? 20 : 5;
  const index = Math.round(vixScore * 0.5 + spyScore * 0.5);
  return { index, label: labelFromScore(index) };
}

function scoreHeadline(title: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const lower = title.toLowerCase();
  const bull = ["rally","surge","jump","gain","soar","record","boom","bull","ceasefire","peace","deal",
    "stimulus","cut rates","rate cut","beats","strong earnings","upgrade","buy","breakout","recovery"];
  const bear = ["crash","plunge","drop","fall","sink","bear","recession","war","conflict","tariff",
    "sanctions","inflation","rate hike","layoffs","miss","downgrade","sell","warning","crisis","default"];
  let b = 0, s = 0;
  for (const w of bull) if (lower.includes(w)) b++;
  for (const w of bear) if (lower.includes(w)) s++;
  return b > s ? "BULLISH" : s > b ? "BEARISH" : "NEUTRAL";
}

export async function GET(req: NextRequest) {
  try {
    let vixLevel = 20, spyChange = 0;
    const tradierKey = process.env.TRADIER_API_KEY;

    if (tradierKey) {
      try {
        const res = await fetch(`${TRADIER_BASE}/markets/quotes?symbols=VIX,SPY&greeks=false`, {
          headers: { Authorization: `Bearer ${tradierKey}`, Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const quotes = data?.quotes?.quote;
          const list = Array.isArray(quotes) ? quotes : quotes ? [quotes] : [];
          for (const q of list) {
            if (q.symbol === "VIX") vixLevel = q.last || q.close || 20;
            if (q.symbol === "SPY") spyChange = q.change_percentage || 0;
          }
        }
      } catch {}
    }

    // Try real Fear & Greed first, fall back to estimate
    const realFng = await fetchRealFearGreed();
    const fg = realFng || estimateFearGreed(vixLevel, spyChange);
    const mood = moodFromScore(fg.index);

    // Fetch headlines
    const headlines: MarketSentiment["headlines"] = [];
    if (tradierKey) {
      try {
        const res = await fetch(`${TRADIER_BASE}/markets/news?q=stock+market&limit=10`, {
          headers: { Authorization: `Bearer ${tradierKey}`, Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const articles = data?.articles?.article || data?.stories?.story || [];
          for (const a of (Array.isArray(articles) ? articles : [articles]).slice(0, 10)) {
            if (a?.title) headlines.push({
              title: a.title, source: a.source || "Market News",
              time: a.date || new Date().toISOString(), sentiment: scoreHeadline(a.title),
            });
          }
        }
      } catch {}
    }

    let signalAdjustment = 0, tradingBias = "Normal conditions — standard parameters apply.";
    if (mood === "EXTREME_GREED") { signalAdjustment = -5; tradingBias = "Strong bullish sentiment — favor momentum, trail stops wider."; }
    else if (mood === "GREED") { tradingBias = "Moderately bullish — lean toward calls."; }
    else if (mood === "FEAR") { signalAdjustment = 5; tradingBias = "Fearful market — only take highest-conviction signals."; }
    else if (mood === "EXTREME_FEAR") { signalAdjustment = 10; tradingBias = "Extreme fear — consider sitting out or reversals only."; }

    return NextResponse.json({
      fearGreedIndex: fg.index, fearGreedLabel: fg.label, marketMood: mood,
      headlines, signalAdjustment, tradingBias, timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Sentiment fetch failed", details: error.message }, { status: 500 });
  }
}
