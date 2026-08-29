import { createFileRoute } from "@tanstack/react-router";

const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h, per the requested cadence

/**
 * Real 24h auto-trigger check for the "Head of SEO" orchestrator
 * (api.orchestrator.run.ts). No separate scheduler process exists in this
 * app -- the AKS worker (worker/aks-worker.mjs), which already runs 24/7
 * under pm2, polls this on every idle cycle and calls /api/orchestrator/run
 * itself for any site that's due. "Due" is computed honestly from the most
 * recent real seo:orchestrator-review claude_jobs row per site (or "never
 * run" if none exists) -- not a fabricated timestamp or a separate
 * last-run table that could drift from what actually happened.
 */
export const Route = createFileRoute("/api/orchestrator/due-sites")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites, claudeJobs } = await import("@/db/schema");
          const { eq, or, desc, sql } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          // Only sites with at least one real live data source connected --
          // running the orchestrator against a site with no GSC/GA4 gives
          // the model nothing real to ground recommendations in.
          const candidateSites = await d
            .select()
            .from(sites)
            .where(or(eq(sites.gscConnected, true), eq(sites.gaConnected, true)));

          const due: { siteId: string; siteName: string; lastRunAt: string | null }[] = [];

          for (const site of candidateSites) {
            const [lastJob] = await d
              .select({ createdAt: claudeJobs.createdAt })
              .from(claudeJobs)
              .where(
                sql`${claudeJobs.kind} = 'seo:orchestrator-review' AND ${claudeJobs.input}->>'siteId' = ${site.id}`,
              )
              .orderBy(desc(claudeJobs.createdAt))
              .limit(1);

            const lastRunAt = lastJob?.createdAt ? new Date(lastJob.createdAt) : null;
            const isDue = !lastRunAt || Date.now() - lastRunAt.getTime() >= AUTO_INTERVAL_MS;

            if (isDue) {
              due.push({ siteId: site.id, siteName: site.name, lastRunAt: lastRunAt?.toISOString() ?? null });
            }
          }

          return Response.json({ ok: true, due });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to check due sites" }, { status: 500 });
        }
      },
    },
  },
});
