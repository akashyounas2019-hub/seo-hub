import { createFileRoute } from "@tanstack/react-router";

/**
 * Called by the worker once a real Playwright QA pass finishes. Bulk-inserts
 * every finding and rolls the run's summary counts + final status
 * (passed/warning/failed, based on whether any critical findings exist).
 */
export const Route = createFileRoute("/api/qa/runs/$id/complete")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { qaRuns, qaFindings } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [run] = await d.select().from(qaRuns).where(eq(qaRuns.id, params.id)).limit(1);
          if (!run) {
            return Response.json({ ok: false, error: "QA run not found" }, { status: 404 });
          }

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const findings = Array.isArray(body.findings) ? body.findings : [];
          const pagesChecked = Number(body.pagesChecked) || 0;
          const durationMs = Number(body.durationMs) || null;

          // Idempotent: a run should be completed once, but if this run_id is
          // re-completed (e.g. a manually retried job), replace its findings
          // rather than accumulating duplicates alongside the old set.
          await d.delete(qaFindings).where(eq(qaFindings.runId, params.id));

          if (findings.length > 0) {
            await d.insert(qaFindings).values(
              findings.map((f: any) => ({
                runId: params.id,
                suite: f.suite,
                pageUrl: f.pageUrl,
                severity: f.severity || "info",
                passed: !!f.passed,
                message: f.message,
                detail: f.detail || null,
              })),
            );
          }

          const checksTotal = findings.length;
          const checksFailed = findings.filter((f: any) => !f.passed).length;
          const checksPassed = checksTotal - checksFailed;
          const hasCritical = findings.some((f: any) => !f.passed && f.severity === "critical");
          const hasWarning = findings.some((f: any) => !f.passed && f.severity === "warning");
          const status = hasCritical ? "failed" : hasWarning ? "warning" : "passed";

          await d
            .update(qaRuns)
            .set({
              status,
              pagesChecked,
              checksTotal,
              checksPassed,
              checksFailed,
              durationMs,
              finishedAt: new Date(),
              // Clear any error left over from a prior failed attempt on this
              // run row -- without this, a run that failed once (e.g. browser
              // not installed yet) and then succeeded on retry kept showing
              // its old error message alongside real, successful findings.
              error: null,
            })
            .where(eq(qaRuns.id, params.id));

          return Response.json({ ok: true, status, checksTotal, checksPassed, checksFailed });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to complete QA run" }, { status: 500 });
        }
      },
    },
  },
});
