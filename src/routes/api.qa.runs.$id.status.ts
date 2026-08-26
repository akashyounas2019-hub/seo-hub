import { createFileRoute } from "@tanstack/react-router";

/**
 * Lets the worker mark a QA run "running" once Playwright actually starts
 * (mirrors how claude_jobs distinguishes queued/claimed/running), and lets
 * it report a hard failure (browser crash, unreachable site, etc.) that
 * isn't a set of findings.
 */
export const Route = createFileRoute("/api/qa/runs/$id/status")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { qaRuns } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const updates: Record<string, any> = {};
          if (body.status === "running") {
            updates.status = "running";
          } else if (body.status === "failed") {
            updates.status = "failed";
            updates.error = String(body.error || "QA run failed").slice(0, 1000);
            updates.finishedAt = new Date();
          } else {
            return Response.json({ ok: false, error: "status must be 'running' or 'failed'" }, { status: 400 });
          }

          await d.update(qaRuns).set(updates).where(eq(qaRuns.id, params.id));
          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to update QA run status" }, { status: 500 });
        }
      },
    },
  },
});
