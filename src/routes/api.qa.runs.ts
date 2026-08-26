import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/qa/runs")({
  server: {
    handlers: {
      // Lists recent QA runs (optionally filtered by siteId) with rollup
      // pass/fail counts already stored on qa_runs -- no per-request
      // aggregation needed.
      GET: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { qaRuns, sites } = await import("@/db/schema");
          const { desc, eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const url = new URL(request.url);
          const siteId = url.searchParams.get("siteId");

          const rows = await d
            .select({ run: qaRuns, siteName: sites.name, siteDomain: sites.domain })
            .from(qaRuns)
            .leftJoin(sites, eq(qaRuns.siteId, sites.id))
            .where(siteId ? eq(qaRuns.siteId, siteId) : undefined as any)
            .orderBy(desc(qaRuns.createdAt))
            .limit(50);

          const runs = rows.map((r) => ({ ...r.run, siteName: r.siteName, siteDomain: r.siteDomain }));

          return Response.json({ ok: true, runs });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load QA runs" }, { status: 500 });
        }
      },
    },
  },
});
