import { createFileRoute } from "@tanstack/react-router";
import { jobsStore } from "@/lib/jobs-store";

export const Route = createFileRoute("/api/jobs/$id/complete")({
  loader: async (ctx: any) => {
    const params = ctx?.params || {};
    const request = ctx?.request;
    try {
      let body: any = {};
      if (request && request.method === "POST") {
        body = await request.json().catch(() => ({}));
      }
      const success = jobsStore.complete(params.id, body.outputMarkdown || "", body.durationMs);

      // Check DB for associated kanban task
      try {
        const { db } = await import("@/db/client");
        const { kanbanTasks, claudeJobs } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");

        const d = db();
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

      return { ok: success };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
  component: ApiJobsCompleteComponent,
});

function ApiJobsCompleteComponent() {
  return null;
}
