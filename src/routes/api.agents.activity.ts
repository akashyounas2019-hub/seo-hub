import { createFileRoute } from "@tanstack/react-router";

// Real "how many agents are actively working right now" -- previously the
// Agents dashboard's "Working" KPI was Math.round(totalAgents * 0.72), a
// made-up formula with no relation to any real job/task state. This counts
// distinct agent names (claude_jobs.input.assignee) with at least one job
// in "claimed" or "running" status right now -- the only honest definition
// of "working" this app's data actually supports.
export const Route = createFileRoute("/api/agents/activity")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { claudeJobs } = await import("@/db/schema");
          const { or, eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const activeJobs = await d
            .select({ input: claudeJobs.input })
            .from(claudeJobs)
            .where(or(eq(claudeJobs.status, "claimed"), eq(claudeJobs.status, "running")));

          const activeAgents = new Set<string>();
          for (const job of activeJobs) {
            const assignee = (job.input as any)?.assignee;
            if (typeof assignee === "string" && assignee.trim()) activeAgents.add(assignee.trim());
          }

          return Response.json({ ok: true, activeAgentCount: activeAgents.size, activeAgents: Array.from(activeAgents) });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load agent activity" }, { status: 500 });
        }
      },
    },
  },
});
