import { createFileRoute } from "@tanstack/react-router";

/**
 * Real per-agent performance metrics, derived from kanban_tasks.assignee --
 * the only real record of which agent/sub-agent a task was assigned to.
 * No synthesized numbers: an agent with zero real tasks gets zero across
 * the board, not a placeholder.
 *
 * "Accuracy" = terminal tasks that succeeded (done/review with real
 * publishedUrl, or status "done") divided by all terminal tasks (done +
 * rejected + cancelled) for that assignee. Tasks still open (todo/
 * inprogress/review without a terminal outcome) are excluded from the
 * accuracy denominator since they haven't succeeded or failed yet.
 *
 * Important honesty note surfaced in the response: assignee is a free-text
 * field the orchestrator/Strategy Plan model fills in, and it does not
 * always match an EXPERTS title or sub-agent name exactly (e.g. "Local SEO
 * Specialist" vs. the real "International & Local Expert" sub-agent roster).
 * This route returns raw assignee-keyed metrics; the caller is responsible
 * for deciding how (or whether) to map a given assignee string onto a real
 * agent -- this route does not guess or fuzzy-match.
 */
export const Route = createFileRoute("/api/agents/metrics")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks } = await import("@/db/schema");

          await ensureSchema();
          const d = db();
          const tasks = await d.select().from(kanbanTasks);

          const byAssignee: Record<
            string,
            {
              assignee: string;
              totalTasks: number;
              completedTasks: number;
              rejectedOrCancelled: number;
              openTasks: number;
              publishedTasks: number;
              accuracyRate: number | null; // null = no terminal tasks yet, not 0%
              dailyCompleted: Record<string, number>; // "2026-08-28" -> count
              firstTaskAt: string | null;
              lastTaskAt: string | null;
            }
          > = {};

          for (const t of tasks) {
            const key = t.assignee || "Unassigned";
            const bucket = (byAssignee[key] ||= {
              assignee: key,
              totalTasks: 0,
              completedTasks: 0,
              rejectedOrCancelled: 0,
              openTasks: 0,
              publishedTasks: 0,
              accuracyRate: null,
              dailyCompleted: {},
              firstTaskAt: null,
              lastTaskAt: null,
            });

            bucket.totalTasks++;
            const createdIso = t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt);
            if (!bucket.firstTaskAt || createdIso < bucket.firstTaskAt) bucket.firstTaskAt = createdIso;
            if (!bucket.lastTaskAt || createdIso > bucket.lastTaskAt) bucket.lastTaskAt = createdIso;

            if (t.status === "done") {
              bucket.completedTasks++;
              // Bucketed by updatedAt (the completion timestamp), not
              // createdAt -- "daily tasks completed" means the day it
              // finished, not the day it was created.
              const updatedIso = t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt);
              const completedDay = updatedIso.slice(0, 10);
              bucket.dailyCompleted[completedDay] = (bucket.dailyCompleted[completedDay] || 0) + 1;
            } else if (t.status === "rejected" || t.status === "cancelled") {
              bucket.rejectedOrCancelled++;
            } else {
              bucket.openTasks++;
            }

            if (t.publishedUrl) bucket.publishedTasks++;
          }

          for (const bucket of Object.values(byAssignee)) {
            const terminal = bucket.completedTasks + bucket.rejectedOrCancelled;
            bucket.accuracyRate = terminal > 0 ? Math.round((bucket.completedTasks / terminal) * 100) : null;
          }

          return Response.json({ ok: true, byAssignee, totalTasksAllAgents: tasks.length });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load agent metrics" }, { status: 500 });
        }
      },
    },
  },
});
