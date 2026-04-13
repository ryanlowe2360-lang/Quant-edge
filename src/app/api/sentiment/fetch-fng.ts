// Fetch real Fear & Greed from CNN with fallback
export async function fetchRealFearGreed(): Promise<{ index: number; label: string } | null> {
  // Try CNN Fear & Greed API
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (res.ok) {
      const data = await res.json();
      const score = Math.round(data?.fear_and_greed?.score || 0);
      if (score > 0) {
        let label = "Neutral";
        if (score >= 75) label = "Extreme Greed";
        else if (score >= 55) label = "Greed";
        else if (score >= 45) label = "Neutral";
        else if (score >= 25) label = "Fear";
        else label = "Extreme Fear";
        return { index: score, label };
      }
    }
  } catch {}

  // Try alternative Fear & Greed API
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (res.ok) {
      const data = await res.json();
      const entry = data?.data?.[0];
      if (entry) {
        const score = parseInt(entry.value);
        return { index: score, label: entry.value_classification || "Neutral" };
      }
    }
  } catch {}

  return null;
}
