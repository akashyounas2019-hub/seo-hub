import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tasks/")({
  loader: async (ctx: any) => {
    const request = ctx?.request;
    const method = request?.method || "GET";

    try {
      const { db, ensureSchema } = await import("@/db/client");
      const { kanbanTasks, kanbanTaskTemplates, claudeJobs } = await import("@/db/schema");
      const { desc } = await import("drizzle-orm");

      await ensureSchema();
      const d = db();

      if (method === "POST" && request) {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          /* fallback */
        }

        const id = body.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date();

        let jobId: string | undefined = undefined;

        if (body.status === "inprogress" || body.executeWithAi) {
          const [job] = await d.insert(claudeJobs).values({
            kind: "kanban_task_execution",
            title: `Execute SEO Task: ${body.title}`,
            input: { taskId: id, assignee: body.assignee, desc: body.desc || body.title, priority: body.priority },
            status: "pending",
            priority: body.priority === "critical" || body.priority === "high" ? "high" : "normal",
            preferWorker: "mac",
            triggerSource: "kanban_allocate",
          }).returning();
          jobId = job.id;
        }

        const newTask = {
          id,
          siteId: body.siteId || "safaeewala",
          title: body.title,
          desc: body.desc || null,
          assignee: body.assignee || "Technical SEO Expert",
          priority: body.priority || "medium",
          status: body.status || "todo",
          due: body.due || null,
          templateId: body.templateId || null,
          jobId: jobId || null,
          outputMarkdown: null,
          createdAt: now,
          updatedAt: now,
        };

        await d.insert(kanbanTasks).values(newTask);
        return { success: true, task: newTask, jobId };
      }

      // Default GET
      const tasksList = await d.select().from(kanbanTasks).orderBy(desc(kanbanTasks.createdAt));
      const templatesList = await d.select().from(kanbanTaskTemplates).orderBy(desc(kanbanTaskTemplates.createdAt));

      return { tasks: tasksList, templates: templatesList };
    } catch (err: any) {
      return { error: err.message || "Failed to process tasks request" };
    }
  },
  component: () => null,
});
