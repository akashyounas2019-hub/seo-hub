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
  issues: PageSpeedIssue[];
};

export type PageSpeedIssue = {
  id: string;
  title: string;
  description: string;
  category: "performance" | "seo" | "accessibility" | "best-practices";
  severity: "critical" | "warning";
  score: number | null; // 0-1, null = not scored (informational audit)
  displayValue?: string; // e.g. "1.2 s", "240 KiB"
};

// Real audits worth surfacing as "issues" -- excludes informational-only
// audits (score: null with no displayValue) that Lighthouse includes for
// context but aren't actionable problems on their own.
const ISSUE_AUDIT_IDS: Record<string, "performance" | "seo" | "accessibility" | "best-practices"> = {
  "largest-contentful-paint": "performance",
  "cumulative-layout-shift": "performance",
  "render-blocking-resources": "performance",
  "unused-css-rules": "performance",
  "unused-javascript": "performance",
  "unminified-css": "performance",
  "unminified-javascript": "performance",
  "modern-image-formats": "performance",
  "uses-optimized-images": "performance",
  "uses-responsive-images": "performance",
  "efficient-animated-content": "performance",
  "server-response-time": "performance",
  "total-byte-weight": "performance",
  "dom-size": "performance",
  "third-party-summary": "performance",
  "meta-description": "seo",
  "document-title": "seo",
  "link-text": "seo",
  "is-crawlable": "seo",
  "robots-txt": "seo",
  "hreflang": "seo",
  "canonical": "seo",
  "structured-data": "seo",
  "image-alt": "accessibility",
  "color-contrast": "accessibility",
  "label": "accessibility",
  "link-name": "accessibility",
  "button-name": "accessibility",
  "html-has-lang": "accessibility",
  "viewport": "best-practices",
  "is-on-https": "best-practices",
  "no-vulnerable-libraries": "best-practices",
  "errors-in-console": "best-practices",
  "deprecations": "best-practices",
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

  const issues: PageSpeedIssue[] = [];
  for (const [auditId, category] of Object.entries(ISSUE_AUDIT_IDS)) {
    const audit = audits[auditId];
    if (!audit) continue;
    // score === 1 (or null with no displayValue) means passing/not-applicable
    // -- only surface audits that actually failed or partially failed.
    if (audit.score === 1 || audit.score === null) continue;
    issues.push({
      id: auditId,
      title: audit.title || auditId,
      description: audit.description ? String(audit.description).replace(/\[.*?\]\(.*?\)/g, "").trim() : "",
      category,
      severity: audit.score !== undefined && audit.score < 0.5 ? "critical" : "warning",
      score: typeof audit.score === "number" ? audit.score : null,
      displayValue: audit.displayValue || undefined,
    });
  }
  // Worst-first: critical before warning, lower score before higher.
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (a.score ?? 1) - (b.score ?? 1);
  });

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
    issues,
  };
}
