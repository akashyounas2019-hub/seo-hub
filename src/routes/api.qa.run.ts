import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

/**
 * Queues a real QA run. Manual trigger only (no scheduler exists in this
 * app -- same as the orchestrator, sitemap crawler, and GBP sync). Creates
 * one claude_jobs row of kind "qa:run" (the worker drives Playwright
 * directly for this kind, not the claude CLI -- see worker/aks-worker.mjs)
 * and one qa_runs row tracking it, then returns both ids for the UI to poll.
 */
export const Route = createFileRoute("/api/qa/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites, claudeJobs, qaRuns } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const { siteId, scope, targetUrl } = body;
          if (!siteId) {
            return Response.json({ ok: false, error: "siteId is required" }, { status: 400 });
          }

          const [site] = await d.select().from(sites).where(eq(sites.id, siteId)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          const resolvedScope = ["full", "landing", "blog", "page"].includes(scope) ? scope : "full";
          if (resolvedScope === "page" && !targetUrl) {
            return Response.json({ ok: false, error: "targetUrl is required for scope 'page'" }, { status: 400 });
          }

          const [run] = await d
            .insert(qaRuns)
            .values({
              siteId: site.id,
              scope: resolvedScope,
              targetUrl: targetUrl || null,
              status: "queued",
            })
            .returning();

          const baseUrl = site.domain.startsWith("http") ? site.domain : `https://${site.domain}`;

          const [job] = await d
            .insert(claudeJobs)
            .values({
              kind: "qa:run",
              title: `QA Suite — ${site.name || site.domain} (${resolvedScope})`,
              input: {
                runId: run.id,
                siteId: site.id,
                baseUrl,
                scope: resolvedScope,
                targetUrl: targetUrl || undefined,
              },
              priority: "normal",
              preferWorker: "any",
              triggerSource: "qa_suite_manual",
            })
            .returning();

          await d.update(qaRuns).set({ jobId: job.id }).where(eq(qaRuns.id, run.id));

          await logAudit(actorEmailFromRequest(request), "qa.run_queued", { runId: run.id, siteId: site.id, scope: resolvedScope });

          return Response.json({ ok: true, runId: run.id, jobId: job.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to queue QA run" }, { status: 500 });
        }
      },
    },
  },
});
