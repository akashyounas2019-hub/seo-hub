import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

/**
 * Re-runs a task's AI execution from scratch -- a real new claude_jobs row
 * (kanban_task_execution), not a client-side re-request of the same
 * output. The task's existing outputMarkdown/jobId are cleared and it goes
 * back to "inprogress" so the worker picks up the new job the same way it
 * would any other; api.jobs.$id.complete.ts's existing taskId branch moves
 * it to "review" again once the new job finishes.
 *
 * Used by the "Regenerate" button on the task result view when the first
 * output wasn't satisfactory -- this is a genuinely new model call (real
 * token cost), not a cached replay.
 */
export const Route = createFileRoute("/api/tasks/$id/regenerate")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [task] = await d.select().from(kanbanTasks).where(eq(kanbanTasks.id, params.id)).limit(1);
          if (!task) {
            return Response.json({ ok: false, error: "Task not found" }, { status: 404 });
          }

          const [job] = await d
            .insert(claudeJobs)
            .values({
              kind: "kanban_task_execution",
              title: `Regenerate: ${task.title}`,
              input: { taskId: params.id, assignee: task.assignee, desc: task.desc || task.title, priority: task.priority },
              status: "pending",
              priority: task.priority === "critical" ? "high" : "normal",
              preferWorker: "mac",
              triggerSource: "task_regenerate",
            })
            .returning();

          const now = new Date();
          await d
            .update(kanbanTasks)
            .set({ status: "inprogress", jobId: job.id, outputMarkdown: null, updatedAt: now })
            .where(eq(kanbanTasks.id, params.id));

          await logAudit(actorEmailFromRequest(request), "task.regenerated", {
            taskId: params.id,
            title: task.title,
            newJobId: job.id,
            previousJobId: task.jobId,
          });

          return Response.json({ ok: true, jobId: job.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to regenerate task" }, { status: 500 });
        }
      },
    },
  },
});
