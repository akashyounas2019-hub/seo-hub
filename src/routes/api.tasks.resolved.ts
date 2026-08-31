import { createFileRoute } from "@tanstack/react-router";

/**
 * Real, distinct third outcome for a task in the Approvals queue alongside
 * Approve (-> inprogress, triggers real AI execution) and Reject (->
 * rejected, discarded): Resolved means the reviewer looked at it and
 * handled it manually outside the normal approve/execute flow, without
 * wanting a real claude_jobs run started. kanban_tasks.status is a plain
 * text column (not a Postgres enum), so "resolved" is a real value here
 * the same way "pending_approval"/"rejected"/"cancelled" already are --
 * no schema migration needed. The actual status transition (PATCH ->
 * status: "resolved") already goes through api.tasks.$id.ts, which
 * records real approvedBy/approvedAt attribution and a task.resolved
 * audit_log entry for it; this route only serves the read side, listing
 * everything that's ever been marked resolved for the new Resolved tab.
 */
export const Route = createFileRoute("/api/tasks/resolved")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks } = await import("@/db/schema");
          const { eq, desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const tasks = await d
            .select()
            .from(kanbanTasks)
            .where(eq(kanbanTasks.status, "resolved"))
            .orderBy(desc(kanbanTasks.updatedAt));

          return Response.json({ ok: true, tasks, count: tasks.length });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load resolved tasks" }, { status: 500 });
        }
      },
    },
  },
});
