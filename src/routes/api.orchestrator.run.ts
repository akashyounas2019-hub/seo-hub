import { createFileRoute } from "@tanstack/react-router";
import { fetchGSCSearchAnalytics } from "@/lib/google/search-console";
import { fetchGA4Report } from "@/lib/google/analytics-ga4";
import { getBusinessCategory } from "@/lib/business-categories";

function formatOffsetDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

/**
 * Manual-trigger-only "Head of SEO" orchestrator. No scheduler — this route
 * is hit by a "Run SEO Review" button. It assembles live GSC + GA4 + the
 * site's Knowledge Base server-side, enqueues one claude_jobs row, and
 * returns the jobId for the UI to poll (same pattern as the Knowledge Base
 * autocrawl flow). The worker's completion handler (api.jobs.$id.complete.ts)
 * parses the model's JSON output and bulk-inserts kanban_tasks with
 * status "pending_approval", running each through the approval-rules engine.
 */
export const Route = createFileRoute("/api/orchestrator/run")({
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

          const siteId = body.siteId;
          if (!siteId) {
            return Response.json({ ok: false, error: "siteId is required" }, { status: 400 });
          }

          const [site] = await d.select().from(sites).where(eq(sites.id, siteId)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          const startDate = formatOffsetDate(30);
          const endDate = formatOffsetDate(2);

          let gscSummary: any = null;
          let topQueries: any[] = [];
          if (site.gscConnected && site.gscPropertyUrl) {
            try {
              const [dateRows, queryRows] = await Promise.all([
                fetchGSCSearchAnalytics(site.gscPropertyUrl, { startDate, endDate, dimensions: ["date"], rowLimit: 500 }),
                fetchGSCSearchAnalytics(site.gscPropertyUrl, { startDate, endDate, dimensions: ["query"], rowLimit: 25 }),
              ]);
              let totalClicks = 0, totalImpressions = 0, sumPosition = 0;
              for (const r of dateRows) {
                totalClicks += r.clicks || 0;
                totalImpressions += r.impressions || 0;
                sumPosition += (r.position || 0) * (r.impressions || 0);
              }
              gscSummary = {
                clicks: totalClicks,
                impressions: totalImpressions,
                ctr: totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
                position: totalImpressions > 0 ? parseFloat((sumPosition / totalImpressions).toFixed(1)) : 0,
                daysCount: dateRows.length,
              };
              topQueries = queryRows;
            } catch {
              gscSummary = null;
            }
          }

          let gaSummary: any = null;
          if (site.gaConnected && site.gaPropertyId) {
            try {
              const report = await fetchGA4Report({
                propertyId: site.gaPropertyId,
                startDate,
                endDate,
                metrics: ["activeUsers", "sessions", "bounceRate", "conversions"],
              });
              gaSummary = report;
            } catch {
              gaSummary = null;
            }
          }

          const category = getBusinessCategory(site.businessCategory);

          const [job] = await d
            .insert(claudeJobs)
            .values({
              kind: "seo:orchestrator-review",
              title: `Head of SEO Review — ${site.name || site.domain}`,
              input: {
                siteId: site.id,
                siteName: site.name,
                domain: site.domain,
                gscSummary,
                gaSummary,
                topQueries,
                businessCategoryHint: category?.promptHint || null,
                plainTextKb: site.knowledgeBase || undefined,
                structuredKb: site.structuredKb || undefined,
                siteKb: site.knowledgeBase || undefined,
              },
              priority: "normal",
              preferWorker: "any",
              triggerSource: "orchestrator_manual",
            })
            .returning();

          return Response.json({ ok: true, jobId: job.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to run orchestrator" }, { status: 500 });
        }
      },
    },
  },
});
