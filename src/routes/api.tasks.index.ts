import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/tasks/")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, kanbanTaskTemplates } = await import("@/db/schema");
          const { desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const tasksList = await d.select().from(kanbanTasks).orderBy(desc(kanbanTasks.createdAt));
          const templatesList = await d.select().from(kanbanTaskTemplates).orderBy(desc(kanbanTaskTemplates.createdAt));

          return Response.json({ tasks: tasksList, templates: templatesList });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process tasks request" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, claudeJobs } = await import("@/db/schema");

          await ensureSchema();
          const d = db();

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
          await logAudit(actorEmailFromRequest(request), "task.created", {
            taskId: id,
            title: newTask.title,
            assignee: newTask.assignee,
            priority: newTask.priority,
            status: newTask.status,
          });
          return Response.json({ success: true, task: newTask, jobId });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process tasks request" }, { status: 500 });
        }
      },
    },
  },
});
