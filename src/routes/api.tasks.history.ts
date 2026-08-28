import { createFileRoute } from "@tanstack/react-router";

// Every real action this app's task/approval pipeline writes to audit_log --
// used to filter the shared audit_log table (which also holds unrelated
// settings/webhook/role entries) down to just Kanban board history.
const TASK_ACTIONS = [
  "task.created",
  "task.status_changed",
  "task.approved",
  "task.rejected",
  "task.published",
  "task.regenerated",
  "task.deleted",
  "approvals.reevaluated",
];

/**
 * Real Kanban board history, sourced from the same audit_log table every
 * privileged action in this app already writes to (src/lib/audit.ts) --
 * not a separate, parallel "activity feed" that could drift from what
 * actually happened. Supports an optional ?taskId= filter for a single
 * task's timeline and ?limit=.
 */
export const Route = createFileRoute("/api/tasks/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { auditLog } = await import("@/db/schema");
          const { and, desc, inArray, sql } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const url = new URL(request.url);
          const taskId = url.searchParams.get("taskId");
          const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);

          const conditions = [inArray(auditLog.action, TASK_ACTIONS)];
          if (taskId) {
            conditions.push(sql`${auditLog.detail}->>'taskId' = ${taskId}`);
          }

          const rows = await d
            .select()
            .from(auditLog)
            .where(and(...conditions))
            .orderBy(desc(auditLog.createdAt))
            .limit(limit);

          return Response.json({ ok: true, entries: rows });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load task history" }, { status: 500 });
        }
      },
    },
  },
});
