import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/automation/flows/$id")({
  loader: async (ctx: any) => {
    const params = ctx?.params || {};
    const request = ctx?.request;
    const method = request?.method || "GET";
    const { id } = params;

    try {
      const { db, ensureSchema } = await import("@/db/client");
      const { automationFlows, claudeJobs } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");

      await ensureSchema();
      const d = db();

      if (method === "DELETE") {
        await d.delete(automationFlows).where(eq(automationFlows.id, id));
        return { success: true, flowId: id };
      }

      if (method === "PATCH" && request) {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          /* fallback */
        }

        const existing = await d.select().from(automationFlows).where(eq(automationFlows.id, id)).limit(1);

        if (existing.length === 0) {
          return { error: "Flow not found" };
        }

        const flow = existing[0];
        let jobId: string | undefined = undefined;

        // If toggling status to running, queue an execution job in claude_jobs
        if (body.status === "running" && flow.status !== "running") {
          const [job] = await d.insert(claudeJobs).values({
            kind: "automation_flow_execution",
            title: `Execute Flow: ${flow.name}`,
            input: { flowId: id, category: flow.category, cadence: flow.cadence, desc: flow.desc },
            status: "pending",
            priority: "normal",
            preferWorker: "mac",
            triggerSource: "automation_toggle",
          }).returning();
          jobId = job.id;
        }

        const updates: Record<string, any> = {
          updatedAt: new Date(),
        };

        if (body.status !== undefined) updates.status = body.status;
        if (body.name !== undefined) updates.name = body.name;
        if (body.desc !== undefined) updates.desc = body.desc;
        if (body.cadence !== undefined) updates.cadence = body.cadence;
        if (body.category !== undefined) updates.category = body.category;
        if (body.assignedAgents !== undefined) updates.assignedAgents = body.assignedAgents;
        if (body.status === "running") updates.lastRun = "Just now";

        await d.update(automationFlows).set(updates).where(eq(automationFlows.id, id));
        return { success: true, flowId: id, updates, jobId };
      }

      // Default GET
      const existing = await d.select().from(automationFlows).where(eq(automationFlows.id, id)).limit(1);
      return { flow: existing[0] || null };
    } catch (err: any) {
      return { error: err.message || "Failed to process automation flow request" };
    }
  },
  component: () => null,
});
