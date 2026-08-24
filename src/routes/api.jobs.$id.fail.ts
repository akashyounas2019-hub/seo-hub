import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/jobs/$id/fail")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const body = await request.json().catch(() => ({}));

          const { db, ensureSchema } = await import("@/db/client");
          const { claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          await d
            .update(claudeJobs)
            .set({ status: "failed", error: body.error || "Unknown error", finishedAt: new Date() })
            .where(eq(claudeJobs.id, params.id));

          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
