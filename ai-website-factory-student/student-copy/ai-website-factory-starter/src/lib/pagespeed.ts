/**
 * Google PageSpeed Insights API v5 wrapper.
 *
 * Free tier: no API key needed (rate limited to ~25 req/100s).
 * With an API key (org_settings.pagespeed_api_key_ciphertext, or the
 * PAGESPEED_API_KEY / PSI_API_KEY env var as a fallback): higher rate limits.
 */

export interface PageSpeedOpportunity {
  title: string;
  savings: string;
  category: string;
}

export interface PageSpeedIssue {
  title: string;
  severity: string;
  affectedPages: number;
}

export interface PageSpeedResult {
  score: number;
  lcp: string;
  cls: string;
  fcp: string;
  tbt: string;
  opportunities: PageSpeedOpportunity[];
  issues: PageSpeedIssue[];
}

// ---------- internal types for the raw API response ----------

interface LighthouseAudit {
  id: string;
  title: string;
  score: number | null;
  displayValue?: string;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    items?: Array<Record<string, unknown>>;
  };
  group?: string;
}

interface PageSpeedApiResponse {
  lighthouseResult: {
    categories: {
      performance: { score: number };
    };
    audits: Record<string, LighthouseAudit>;
    categoryGroups?: Record<string, { title: string }>;
  };
  error?: { message: string };
}

// ---------- helpers ----------

function auditCategory(audit: LighthouseAudit): string {
  const t = (audit.title ?? "").toLowerCase();
  if (t.includes("image") || t.includes("webp") || t.includes("avif")) return "Images";
  if (t.includes("css") || t.includes("stylesheet")) return "CSS";
  if (t.includes("javascript") || t.includes("js") || t.includes("script")) return "JavaScript";
  if (t.includes("font")) return "Fonts";
  if (t.includes("server") || t.includes("compress") || t.includes("cache") || t.includes("redirect"))
    return "Server";
  return "General";
}

function severityFromScore(score: number | null): string {
  if (score === null || score === 0) return "high";
  if (score < 0.5) return "high";
  if (score < 0.9) return "medium";
  return "low";
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

// ---------- main export ----------

export async function fetchPageSpeed(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
  apiKey?: string,
): Promise<PageSpeedResult> {
  const key = apiKey ?? process.env.PAGESPEED_API_KEY ?? process.env.PSI_API_KEY;

  let endpoint =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(url)}` +
    `&strategy=${strategy}` +
    `&category=performance`;

  if (key) {
    endpoint += `&key=${key}`;
  }

  const res = await fetch(endpoint, { cache: "no-store" });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`PageSpeed API returned ${res.status}: ${text}`);
  }

  const data = (await res.json()) as PageSpeedApiResponse;

  if (data.error) {
    throw new Error(`PageSpeed API error: ${data.error.message}`);
  }

  const lhr = data.lighthouseResult;
  const audits = lhr.audits;

  const score = Math.round((lhr.categories.performance.score ?? 0) * 100);
  const lcp = audits["largest-contentful-paint"]?.displayValue ?? "N/A";
  const cls = audits["cumulative-layout-shift"]?.displayValue ?? "N/A";
  const fcp = audits["first-contentful-paint"]?.displayValue ?? "N/A";
  const tbt = audits["total-blocking-time"]?.displayValue ?? "N/A";

  // Opportunities: audits with type === "opportunity" and meaningful savings
  const opportunities: PageSpeedOpportunity[] = [];
  for (const audit of Object.values(audits)) {
    if (
      audit.details?.type === "opportunity" &&
      typeof audit.details.overallSavingsMs === "number" &&
      audit.details.overallSavingsMs > 0
    ) {
      opportunities.push({
        title: audit.title,
        savings: formatMs(audit.details.overallSavingsMs),
        category: auditCategory(audit),
      });
    }
  }
  // Sort by savings descending (parse the numeric part)
  opportunities.sort((a, b) => {
    const msA = parseFloat(a.savings);
    const msB = parseFloat(b.savings);
    return msB - msA;
  });

  // Issues: diagnostics (non-opportunity audits that failed, score < 1)
  const issues: PageSpeedIssue[] = [];
  for (const audit of Object.values(audits)) {
    if (
      audit.score !== null &&
      audit.score < 1 &&
      audit.details?.type !== "opportunity" &&
      audit.id !== "largest-contentful-paint" &&
      audit.id !== "cumulative-layout-shift" &&
      audit.id !== "first-contentful-paint" &&
      audit.id !== "total-blocking-time" &&
      audit.id !== "speed-index" &&
      audit.id !== "interactive" &&
      audit.title
    ) {
      const affectedPages = audit.details?.items?.length ?? 1;
      issues.push({
        title: audit.title,
        severity: severityFromScore(audit.score),
        affectedPages,
      });
    }
  }
  // Sort by severity: high first, then medium, then low
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  return { score, lcp, cls, fcp, tbt, opportunities, issues };
}
