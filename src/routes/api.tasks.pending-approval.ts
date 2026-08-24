import { createFileRoute } from "@tanstack/react-router";
import { evaluateApproval, type EvaluableRule } from "@/lib/approval-rules";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/tasks/pending-approval")({
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
            .where(eq(kanbanTasks.status, "pending_approval"))
            .orderBy(desc(kanbanTasks.createdAt));

          return Response.json({ ok: true, tasks, count: tasks.length });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load pending approvals" }, { status: 500 });
        }
      },
      // Re-evaluate every pending_approval task against the current rule set --
      // used after the rules themselves change, so existing pending tasks pick
      // up the new policy instead of being stuck under whatever rule applied
      // at creation time.
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, approvalRules } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [pending, rules] = await Promise.all([
            d.select().from(kanbanTasks).where(eq(kanbanTasks.status, "pending_approval")),
            d.select().from(approvalRules),
          ]);

          const evaluableRules: EvaluableRule[] = rules.map((r) => ({
            id: r.id,
            name: r.name,
            minPriority: r.minPriority,
            category: r.category,
            siteId: r.siteId,
            requiresApproval: r.requiresApproval,
            enabled: r.enabled,
          }));

          let autoApproved = 0;
          for (const task of pending) {
            const decision = evaluateApproval(
              { priority: task.priority, category: task.templateId, siteId: task.siteId },
              evaluableRules,
            );
            if (!decision.requiresApproval) {
              await d.update(kanbanTasks).set({ status: "todo", updatedAt: new Date() }).where(eq(kanbanTasks.id, task.id));
              autoApproved++;
            }
          }

          await logAudit(actorEmailFromRequest(request), "approvals.reevaluated", {
            reviewed: pending.length,
            autoApproved,
          });

          return Response.json({ ok: true, reviewed: pending.length, autoApproved });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to re-evaluate pending approvals" }, { status: 500 });
        }
      },
    },
  },
});
