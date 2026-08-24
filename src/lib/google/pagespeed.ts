// Google PageSpeed Insights API -- free, keyless up to a modest per-IP quota
// (no OAuth needed, unlike the rest of src/lib/google/*.ts). An optional
// GOOGLE_PAGESPEED_API_KEY env var raises that quota if set; the call still
// works without one.

export type PageSpeedResult = {
  performanceScore: number | null;
  seoScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  inpMs: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
};

function pctScore(v: unknown): number | null {
  const n = Number((v as any)?.score);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function metricMs(v: unknown): number | null {
  const n = Number((v as any)?.numericValue);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function fetchPageSpeedInsights(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
): Promise<PageSpeedResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const params = new URLSearchParams({
    url,
    strategy,
    category: "performance,seo,accessibility,best-practices",
  });
  if (apiKey) params.set("key", apiKey);

  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
    { signal: AbortSignal.timeout(25000) },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PageSpeed Insights failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const categories = data?.lighthouseResult?.categories || {};
  const audits = data?.lighthouseResult?.audits || {};

  return {
    performanceScore: pctScore(categories.performance),
    seoScore: pctScore(categories.seo),
    accessibilityScore: pctScore(categories.accessibility),
    bestPracticesScore: pctScore(categories["best-practices"]),
    lcpMs: metricMs(audits["largest-contentful-paint"]),
    clsScore: audits["cumulative-layout-shift"]?.numericValue ?? null,
    inpMs: metricMs(audits["interaction-to-next-paint"]) ?? metricMs(audits["max-potential-fid"]),
    fcpMs: metricMs(audits["first-contentful-paint"]),
    ttfbMs: metricMs(audits["server-response-time"]),
  };
}
