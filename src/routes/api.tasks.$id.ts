import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/tasks/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const existing = await d.select().from(kanbanTasks).where(eq(kanbanTasks.id, params.id)).limit(1);
          return Response.json({ task: existing[0] || null });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process task request" }, { status: 500 });
        }
      },
      PATCH: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const existing = await d.select().from(kanbanTasks).where(eq(kanbanTasks.id, params.id)).limit(1);

          if (existing.length === 0) {
            return Response.json({ error: "Task not found" }, { status: 404 });
          }

          const task = existing[0];
          let jobId = task.jobId;

          // If status changed to inprogress and no job exists, create a job
          if (body.status === "inprogress" && !jobId) {
            const [job] = await d.insert(claudeJobs).values({
              kind: "kanban_task_execution",
              title: `Execute SEO Task: ${task.title}`,
              input: { taskId: params.id, assignee: body.assignee || task.assignee, desc: task.desc || task.title, priority: body.priority || task.priority },
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

          // A task leaving pending_approval via a human action in /approvals
          // gets real attribution -- who approved/rejected it, not silence.
          const wasPendingApproval = task.status === "pending_approval";
          const leavingPendingApproval = wasPendingApproval && body.status !== undefined && body.status !== "pending_approval";
          if (leavingPendingApproval) {
            const actor = actorEmailFromRequest(request);
            updates.approvedBy = actor;
            updates.approvedAt = new Date();
            await logAudit(actor, body.status === "rejected" ? "task.rejected" : "task.approved", {
              taskId: params.id,
              title: task.title,
              newStatus: body.status,
            });
          }

          await d.update(kanbanTasks).set(updates).where(eq(kanbanTasks.id, params.id));
          return Response.json({ success: true, taskId: params.id, updates });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process task request" }, { status: 500 });
        }
      },
      DELETE: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(kanbanTasks).where(eq(kanbanTasks.id, params.id));
          return Response.json({ success: true, taskId: params.id });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process task request" }, { status: 500 });
        }
      },
    },
  },
});
