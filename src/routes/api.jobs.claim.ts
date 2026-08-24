import { createFileRoute } from "@tanstack/react-router";
import { buildPromptForKind } from "@/lib/job-templates";

export const Route = createFileRoute("/api/jobs/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { claudeJobs } = await import("@/db/schema");
          const { eq, asc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let workerId = "mac-worker";
          const body = await request.json().catch(() => ({}));
          workerId = body.workerId || "mac-worker";

          const pending = await d
            .select()
            .from(claudeJobs)
            .where(eq(claudeJobs.status, "pending"))
            .orderBy(asc(claudeJobs.createdAt))
            .limit(1);

          if (pending.length === 0) {
            return Response.json({ ok: true, job: null });
          }

          const claimed = pending[0];
          await d
            .update(claudeJobs)
            .set({ status: "claimed", claimedAt: new Date(), workerId })
            .where(eq(claudeJobs.id, claimed.id));

          const prompt = buildPromptForKind(claimed.kind, claimed.input as Record<string, any>);

          return Response.json({
            ok: true,
            job: {
              id: claimed.id,
              kind: claimed.kind,
              title: claimed.title,
              prompt,
              input: claimed.input,
            },
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
