import { createFileRoute } from "@tanstack/react-router";
import { getSeoTool } from "@/lib/seo-tools";
import { getBusinessCategory } from "@/lib/business-categories";
import { fetchGSCSearchAnalytics } from "@/lib/google/search-console";
import { fetchGA4Report } from "@/lib/google/analytics-ga4";
import { fetchPageSpeedInsights } from "@/lib/google/pagespeed";
import { fetchGBPAccounts, fetchGBPLocations } from "@/lib/google/business-profile";

function formatOffsetDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

async function fetchRobotsAndSitemap(domain: string) {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const origin = new URL(base).origin;
  const [robotsRes, sitemapRes] = await Promise.all([
    fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(8000) }).catch(() => null),
  ]);
  const robotsTxt = robotsRes?.ok ? (await robotsRes.text()).slice(0, 3000) : null;
  const sitemapXml = sitemapRes?.ok ? (await sitemapRes.text()).slice(0, 3000) : null;
  return {
    robotsTxt,
    robotsStatus: robotsRes?.status ?? null,
    sitemapXml,
    sitemapStatus: sitemapRes?.status ?? null,
  };
}

/**
 * Enqueues real claude_jobs execution for any of the 17 SEO Suite tools.
 * All 17 get real job-queue execution with a business-category-aware
 * prompt (job-templates.ts, "seo-suite:<toolId>"). Four get a deep build
 * layering real free-API data on top before the model runs:
 *   - full-audit: PageSpeed Insights + live GSC + live GA4
 *   - technical-seo: PageSpeed Insights + robots.txt/sitemap.xml fetch
 *   - local-seo: real Google Business Profile accounts/locations
 *   - schema: grounded in the site's real structuredKb (no external API)
 */
export const Route = createFileRoute("/api/seo-suite/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites, claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const { toolId, siteId, inputs } = body;
          const tool = getSeoTool(toolId);
          if (!tool) {
            return Response.json({ ok: false, error: "Unknown tool" }, { status: 400 });
          }

          let site: any = null;
          if (siteId) {
            const [row] = await d.select().from(sites).where(eq(sites.id, siteId)).limit(1);
            site = row || null;
          }

          const category = getBusinessCategory(site?.businessCategory);
          const targetUrl: string | undefined = inputs?.["Site URL"] || inputs?.["Page URL"] || inputs?.["Landing page URL"];

          const jobInput: Record<string, any> = {
            toolId,
            toolTitle: tool.title,
            toolCategory: tool.category,
            inputs: inputs || {},
            siteId: site?.id,
            siteName: site?.name,
            domain: site?.domain,
            businessCategoryHint: category?.promptHint || null,
            plainTextKb: site?.knowledgeBase || undefined,
            structuredKb: site?.structuredKb || undefined,
            siteKb: site?.knowledgeBase || undefined,
          };

          // --- Deep builds: real free-API data layered in before the LLM runs ---
          if (toolId === "full-audit" || toolId === "technical-seo") {
            const psiUrl = targetUrl || (site?.domain ? `https://${site.domain}` : undefined);
            if (psiUrl) {
              try {
                jobInput.pageSpeed = await fetchPageSpeedInsights(psiUrl, "mobile");
              } catch (e: any) {
                jobInput.pageSpeedError = e.message;
              }
            }
          }

          if (toolId === "full-audit") {
            const startDate = formatOffsetDate(30);
            const endDate = formatOffsetDate(2);
            if (site?.gscConnected && site.gscPropertyUrl) {
              try {
                const dateRows = await fetchGSCSearchAnalytics(site.gscPropertyUrl, { startDate, endDate, dimensions: ["date"], rowLimit: 500 });
                let clicks = 0, impressions = 0, sumPos = 0;
                for (const r of dateRows) {
                  clicks += r.clicks || 0;
                  impressions += r.impressions || 0;
                  sumPos += (r.position || 0) * (r.impressions || 0);
                }
                jobInput.gscSummary = {
                  clicks, impressions,
                  ctr: impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0,
                  position: impressions > 0 ? parseFloat((sumPos / impressions).toFixed(1)) : 0,
                };
              } catch {
                /* leave gscSummary unset -- prompt handles "not connected" */
              }
            }
            if (site?.gaConnected && site.gaPropertyId) {
              try {
                jobInput.gaSummary = await fetchGA4Report({
                  propertyId: site.gaPropertyId,
                  startDate, endDate,
                  metrics: ["activeUsers", "sessions", "bounceRate", "conversions"],
                });
              } catch {
                /* leave gaSummary unset */
              }
            }
          }

          if (toolId === "technical-seo") {
            const domainForCrawl = targetUrl || (site?.domain ? `https://${site.domain}` : undefined);
            if (domainForCrawl) {
              try {
                Object.assign(jobInput, await fetchRobotsAndSitemap(domainForCrawl));
              } catch {
                /* non-fatal */
              }
            }
          }

          if (toolId === "local-seo") {
            try {
              const accounts = await fetchGBPAccounts();
              if (accounts.length > 0) {
                const locations = await fetchGBPLocations(accounts[0].name).catch(() => []);
                jobInput.gbpAccounts = accounts;
                jobInput.gbpLocations = locations;
              }
            } catch (e: any) {
              jobInput.gbpError = e.message;
            }
          }

          const [job] = await d
            .insert(claudeJobs)
            .values({
              kind: `seo-suite:${toolId}`,
              title: `${tool.title} — ${site?.name || site?.domain || targetUrl || "SEO Suite"}`,
              input: jobInput,
              priority: "normal",
              preferWorker: "any",
              triggerSource: "seo_suite_manual",
            })
            .returning();

          return Response.json({ ok: true, jobId: job.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to run SEO Suite tool" }, { status: 500 });
        }
      },
    },
  },
});
