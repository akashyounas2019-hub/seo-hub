import { createFileRoute } from "@tanstack/react-router";
import { fetchPageSpeedInsights, type PageSpeedIssue } from "@/lib/google/pagespeed";

export type TechnicalIssue = {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning";
};

/**
 * Real, cheap technical checks that don't need PageSpeed Insights -- direct
 * fetches against the site's own robots.txt/sitemap.xml/HTTPS, same style
 * as sitemap-crawler.ts. Returns only checks that actually failed; a clean
 * site returns an empty array, never a fabricated "all good" filler issue.
 */
async function runTechnicalChecks(domain: string): Promise<TechnicalIssue[]> {
  const issues: TechnicalIssue[] = [];
  const origin = (domain.startsWith("http") ? domain : `https://${domain}`).replace(/\/$/, "");

  if (!domain.startsWith("https://") && domain.startsWith("http://")) {
    issues.push({
      id: "not-https",
      title: "Site is not served over HTTPS",
      description: "The stored domain uses http:// instead of https:// -- a real ranking and trust signal.",
      severity: "critical",
    });
  }

  const [robotsRes, sitemapRes] = await Promise.all([
    fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(8000) }).catch(() => null),
  ]);

  if (!robotsRes || !robotsRes.ok) {
    issues.push({
      id: "robots-missing",
      title: "robots.txt not found or unreachable",
      description: `GET ${origin}/robots.txt returned ${robotsRes ? robotsRes.status : "no response"}. Search engines can't read your crawl directives.`,
      severity: "warning",
    });
  } else {
    const robotsTxt = await robotsRes.text().catch(() => "");
    if (/disallow:\s*\/\s*$/im.test(robotsTxt)) {
      issues.push({
        id: "robots-blocks-all",
        title: "robots.txt disallows the entire site",
        description: "Found \"Disallow: /\" -- this blocks all search engine crawling of the site.",
        severity: "critical",
      });
    }
    if (!/sitemap:/im.test(robotsTxt)) {
      issues.push({
        id: "robots-missing-sitemap-directive",
        title: "robots.txt doesn't reference a sitemap",
        description: "No \"Sitemap:\" directive found in robots.txt -- search engines may not discover your sitemap automatically.",
        severity: "warning",
      });
    }
  }

  if (!sitemapRes || !sitemapRes.ok) {
    issues.push({
      id: "sitemap-missing",
      title: "sitemap.xml not found at the default location",
      description: `GET ${origin}/sitemap.xml returned ${sitemapRes ? sitemapRes.status : "no response"}. If your sitemap lives elsewhere, set it in the Site Pages tab.`,
      severity: "warning",
    });
  }

  return issues;
}

type DiagnosticsResult = {
  scores: Record<string, number | null> | null;
  pageSpeedIssues: PageSpeedIssue[];
  pageSpeedError: string | null;
  technicalIssues: TechnicalIssue[];
  checkedUrl: string;
};

/**
 * Runs the real PSI + technical checks and persists the result to
 * site_diagnostics_reports (one row per site+strategy, upserted). Shared by
 * the manual re-check trigger below and the daily automated diagnostics
 * agent (api.site-diagnostics.run.ts), so there's exactly one real check
 * implementation, not two that could drift.
 */
export async function runAndStoreDiagnostics(
  siteId: string,
  domain: string,
  strategy: "mobile" | "desktop",
  source: "manual" | "daily-auto",
): Promise<DiagnosticsResult> {
  const targetUrl = domain.startsWith("http") ? domain : `https://${domain}`;

  let pageSpeedIssues: PageSpeedIssue[] = [];
  let pageSpeedError: string | null = null;
  let scores: Record<string, number | null> | null = null;

  try {
    const psi = await fetchPageSpeedInsights(targetUrl, strategy);
    pageSpeedIssues = psi.issues;
    scores = {
      performanceScore: psi.performanceScore,
      seoScore: psi.seoScore,
      accessibilityScore: psi.accessibilityScore,
      bestPracticesScore: psi.bestPracticesScore,
      lcpMs: psi.lcpMs,
      clsScore: psi.clsScore,
      inpMs: psi.inpMs,
      fcpMs: psi.fcpMs,
      ttfbMs: psi.ttfbMs,
    };
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || /timeout|aborted/i.test(String(err?.message || ""));
    pageSpeedError = timedOut
      ? "PageSpeed Insights didn't respond in time for this run. Google's own Lighthouse pass can occasionally take longer than usual under load -- try Re-check again in a moment."
      : err.message;
  }

  const technicalIssues = await runTechnicalChecks(domain);

  const result: DiagnosticsResult = { scores, pageSpeedIssues, pageSpeedError, technicalIssues, checkedUrl: targetUrl };

  const { db, ensureSchema } = await import("@/db/client");
  const { siteDiagnosticsReports } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");

  await ensureSchema();
  const d = db();

  const [existing] = await d
    .select({ id: siteDiagnosticsReports.id })
    .from(siteDiagnosticsReports)
    .where(and(eq(siteDiagnosticsReports.siteId, siteId), eq(siteDiagnosticsReports.strategy, strategy)))
    .limit(1);

  const row = {
    scores,
    pageSpeedIssues: pageSpeedIssues as unknown as Record<string, unknown>[],
    pageSpeedError,
    technicalIssues: technicalIssues as unknown as Record<string, unknown>[],
    checkedUrl: targetUrl,
    source,
    checkedAt: new Date(),
  };

  if (existing) {
    await d.update(siteDiagnosticsReports).set(row).where(eq(siteDiagnosticsReports.id, existing.id));
  } else {
    await d.insert(siteDiagnosticsReports).values({ siteId, strategy, ...row });
  }

  return result;
}

export const Route = createFileRoute("/api/sites/$id/issues")({
  server: {
    handlers: {
      // Returns whatever is already cached (near-instant) -- never runs a
      // live PSI check itself. This is what the dashboard loads on mount so
      // it shows the most recent real result immediately instead of
      // blocking on a fresh 20-60s Lighthouse pass every time the page
      // opens. Use POST to actually trigger a fresh check.
      GET: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites, siteDiagnosticsReports } = await import("@/db/schema");
          const { eq, and } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [site] = await d.select().from(sites).where(eq(sites.id, params.id)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          const url = new URL(request.url);
          const strategy = (url.searchParams.get("strategy") as "mobile" | "desktop") || "mobile";

          const [cached] = await d
            .select()
            .from(siteDiagnosticsReports)
            .where(and(eq(siteDiagnosticsReports.siteId, site.id), eq(siteDiagnosticsReports.strategy, strategy)))
            .limit(1);

          if (!cached) {
            return Response.json({ ok: true, cached: false, scores: null, pageSpeedIssues: [], pageSpeedError: null, technicalIssues: [], checkedUrl: null, checkedAt: null });
          }

          return Response.json({
            ok: true,
            cached: true,
            scores: cached.scores,
            pageSpeedIssues: cached.pageSpeedIssues,
            pageSpeedError: cached.pageSpeedError,
            technicalIssues: cached.technicalIssues,
            checkedUrl: cached.checkedUrl,
            checkedAt: cached.checkedAt,
            source: cached.source,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load cached issues" }, { status: 500 });
        }
      },

      // Actually triggers a fresh, real PSI + technical check and waits for
      // it (the "Re-check" button) -- kept as a normal awaited POST rather
      // than a job queue since the frontend already shows the last cached
      // result while this runs, so there's no blank-screen wait; the 90s
      // PSI timeout has real room to complete instead of the previous 25s.
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [site] = await d.select().from(sites).where(eq(sites.id, params.id)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          const url = new URL(request.url);
          const strategy = (url.searchParams.get("strategy") as "mobile" | "desktop") || "mobile";

          const result = await runAndStoreDiagnostics(site.id, site.domain, strategy, "manual");

          return Response.json({ ok: true, ...result, checkedAt: new Date().toISOString() });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to check site issues" }, { status: 500 });
        }
      },
    },
  },
});
