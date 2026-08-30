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

/**
 * Resolves the PageSpeed API key from, in order: the env var, then the
 * encrypted key stored in Settings > API Keys (org_settings.pagespeed_api_key_ciphertext)
 * -- that field existed and was settable from the UI but nothing actually
 * read it for PSI calls before this. Returns undefined (keyless, quota-
 * limited) if neither is set.
 */
async function resolvePageSpeedApiKey(): Promise<string | undefined> {
  if (process.env.GOOGLE_PAGESPEED_API_KEY) return process.env.GOOGLE_PAGESPEED_API_KEY;
  try {
    const { db, ensureSchema } = await import("../../db/client");
    const { orgSettings } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { decrypt } = await import("../crypto");

    await ensureSchema();
    const d = db();
    const [row] = await d.select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);
    if (row?.pagespeedApiKeyCiphertext) {
      return decrypt(row.pagespeedApiKeyCiphertext);
    }
  } catch {
    /* no stored key, or decryption unavailable -- fall through to keyless */
  }
  return undefined;
}

// A real PSI run against all four Lighthouse categories in one request
// (performance + seo + accessibility + best-practices) commonly takes
// 20-50s, and can run past 60s for a slow target site -- Google's own PSI
// web UI displays the same wait. The previous 25s AbortSignal timeout was
// shorter than a normal successful run, not just a safety ceiling, so it
// was aborting real in-flight requests and surfacing as "operation was
// aborted due to timeout" even though the API key and connection were
// both fine. 90s gives a real run room to finish while still failing fast
// enough that a caller isn't left hanging indefinitely.
const PSI_TIMEOUT_MS = 90_000;

export async function fetchPageSpeedInsights(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
): Promise<PageSpeedResult> {
  const apiKey = await resolvePageSpeedApiKey();
  // The PSI API takes `category` as a repeated query param, not a single
  // comma-joined value -- passing "performance,seo,accessibility,best-practices"
  // as one string is rejected by Google with a 400 "Invalid value at
  // 'category'" error that has nothing to do with the API key.
  const params = new URLSearchParams({ url, strategy });
  for (const cat of ["performance", "seo", "accessibility", "best-practices"]) {
    params.append("category", cat);
  }
  if (apiKey) params.set("key", apiKey);

  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
    { signal: AbortSignal.timeout(PSI_TIMEOUT_MS) },
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
