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

          // Not tightly paginated: the board's own KPIs (done/inprogress
          // counts in use-tasks.ts) are computed client-side over this exact
          // list, so a real page-size limit here would silently understate
          // them. The cap is a runaway-query guard for this app's real
          // scale, not a functional page size -- if the task volume grows
          // enough to need real pagination, the KPI aggregation should move
          // server-side (SQL COUNT) at the same time, not before.
          const tasksList = await d.select().from(kanbanTasks).orderBy(desc(kanbanTasks.createdAt)).limit(5000);
          const templatesList = await d.select().from(kanbanTaskTemplates).orderBy(desc(kanbanTaskTemplates.createdAt)).limit(500);

          return Response.json({ tasks: tasksList, templates: templatesList });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process tasks request" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, claudeJobs, sites } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");
          const { siteContextForJobInput } = await import("@/lib/job-templates");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          // A caller omitting siteId used to fall back to a hardcoded
          // "safaeewala" string -- silently wrong the moment a second real
          // site exists. Resolve the real site row instead of just an id:
          // still a best-effort default for a caller that didn't specify
          // one, but now grounded in what's actually connected, and the
          // full row is what lets a real execution job include Knowledge
          // Base context instead of running on the task title alone.
          const [resolvedSite] = body.siteId
            ? await d.select().from(sites).where(eq(sites.id, body.siteId)).limit(1)
            : await d.select().from(sites).limit(1);

          // Checked before creating anything (a job used to be inserted
          // here even when no site could be resolved, leaving an orphaned
          // claude_jobs row behind a 400 response).
          if (!resolvedSite) {
            return Response.json(
              { ok: false, error: "No site is connected yet — add a site before creating tasks." },
              { status: 400 },
            );
          }

          const id = body.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const now = new Date();

          let jobId: string | undefined = undefined;

          if (body.status === "inprogress" || body.executeWithAi) {
            const [job] = await d.insert(claudeJobs).values({
              kind: "kanban_task_execution",
              title: `Execute SEO Task: ${body.title}`,
              input: {
                taskId: id,
                assignee: body.assignee,
                desc: body.desc || body.title,
                priority: body.priority,
                ...siteContextForJobInput(resolvedSite),
              },
              status: "pending",
              priority: body.priority === "critical" || body.priority === "high" ? "high" : "normal",
              preferWorker: "mac",
              triggerSource: "kanban_allocate",
            }).returning();
            jobId = job.id;
          }

          const newTask = {
            id,
            siteId: resolvedSite.id,
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
