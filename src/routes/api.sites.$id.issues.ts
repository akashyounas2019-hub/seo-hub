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

export const Route = createFileRoute("/api/sites/$id/issues")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
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
          const targetUrl = site.domain.startsWith("http") ? site.domain : `https://${site.domain}`;

          let pageSpeedIssues: PageSpeedIssue[] = [];
          let pageSpeedError: string | null = null;
          let scores: {
            performanceScore: number | null;
            seoScore: number | null;
            accessibilityScore: number | null;
            bestPracticesScore: number | null;
            lcpMs: number | null;
            clsScore: number | null;
            inpMs: number | null;
            fcpMs: number | null;
            ttfbMs: number | null;
          } | null = null;

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
            pageSpeedError = err.message;
          }

          const technicalIssues = await runTechnicalChecks(site.domain);

          return Response.json({
            ok: true,
            scores,
            pageSpeedIssues,
            pageSpeedError,
            technicalIssues,
            checkedUrl: targetUrl,
            checkedAt: new Date().toISOString(),
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to check site issues" }, { status: 500 });
        }
      },
    },
  },
});
