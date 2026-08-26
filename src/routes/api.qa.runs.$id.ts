import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/qa/runs/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { qaRuns, qaFindings } = await import("@/db/schema");
          const { eq, desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [run] = await d.select().from(qaRuns).where(eq(qaRuns.id, params.id)).limit(1);
          if (!run) {
            return Response.json({ ok: false, error: "QA run not found" }, { status: 404 });
          }

          const findings = await d
            .select()
            .from(qaFindings)
            .where(eq(qaFindings.runId, params.id))
            .orderBy(desc(qaFindings.createdAt));

          return Response.json({ ok: true, run, findings });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load QA run" }, { status: 500 });
        }
      },
    },
  },
});
