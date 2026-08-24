import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/jobs/$id/complete")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const body = await request.json().catch(() => ({}));

          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          await d
            .update(claudeJobs)
            .set({
              status: "done",
              outputMarkdown: body.outputMarkdown || "",
              durationMs: body.durationMs,
              finishedAt: new Date(),
            })
            .where(eq(claudeJobs.id, params.id));

          // Check DB for associated kanban task
          try {
            const [job] = await d.select().from(claudeJobs).where(eq(claudeJobs.id, params.id)).limit(1);

            if (job && (job.input as any)?.taskId) {
              const taskId = (job.input as any).taskId;
              await d.update(kanbanTasks).set({
                status: "review",
                outputMarkdown: body.outputMarkdown || "Task execution complete.",
                updatedAt: new Date(),
              }).where(eq(kanbanTasks.id, taskId));
            }
          } catch (dbErr) {
            /* DB non-fatal */
          }

          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
