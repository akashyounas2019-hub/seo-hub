import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tasks/$id")({
  loader: async (ctx: any) => {
    const params = ctx?.params || {};
    const request = ctx?.request;
    const method = request?.method || "GET";
    const { id } = params;

    try {
      const { db, ensureSchema } = await import("@/db/client");
      const { kanbanTasks, claudeJobs } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");

      await ensureSchema();
      const d = db();

      if (method === "DELETE") {
        await d.delete(kanbanTasks).where(eq(kanbanTasks.id, id));
        return { success: true, taskId: id };
      }

      if (method === "PATCH" && request) {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          /* fallback */
        }

        const existing = await d.select().from(kanbanTasks).where(eq(kanbanTasks.id, id)).limit(1);

        if (existing.length === 0) {
          return { error: "Task not found" };
        }

        const task = existing[0];
        let jobId = task.jobId;

        // If status changed to inprogress and no job exists, create a job
        if (body.status === "inprogress" && !jobId) {
          const [job] = await d.insert(claudeJobs).values({
            kind: "kanban_task_execution",
            title: `Execute SEO Task: ${task.title}`,
            input: { taskId: id, assignee: body.assignee || task.assignee, desc: task.desc || task.title, priority: body.priority || task.priority },
            status: "pending",
            priority: (body.priority || task.priority) === "critical" ? "high" : "normal",
            preferWorker: "mac",
            triggerSource: "kanban_drag",
          }).returning();
          jobId = job.id;
        }

        const updates: Record<string, any> = {
          updatedAt: new Date(),
        };

        if (body.status !== undefined) updates.status = body.status;
        if (body.priority !== undefined) updates.priority = body.priority;
        if (body.assignee !== undefined) updates.assignee = body.assignee;
        if (body.title !== undefined) updates.title = body.title;
        if (body.desc !== undefined) updates.desc = body.desc;
        if (jobId) updates.jobId = jobId;

        await d.update(kanbanTasks).set(updates).where(eq(kanbanTasks.id, id));
        return { success: true, taskId: id, updates };
      }

      // Default GET
      const existing = await d.select().from(kanbanTasks).where(eq(kanbanTasks.id, id)).limit(1);
      return { task: existing[0] || null };
    } catch (err: any) {
      return { error: err.message || "Failed to process task request" };
    }
  },
  component: () => null,
});
