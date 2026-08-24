import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/jobs/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const [job] = await d.select().from(claudeJobs).where(eq(claudeJobs.id, params.id)).limit(1);
          return Response.json({ ok: true, job: job || null });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to process job request" }, { status: 500 });
        }
      },
      DELETE: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(claudeJobs).where(eq(claudeJobs.id, params.id));
          return Response.json({ ok: true, jobId: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to process job request" }, { status: 500 });
        }
      },
    },
  },
});
