import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/automation/flows")({
  loader: async (ctx: any) => {
    const request = ctx?.request;
    const method = request?.method || "GET";

    try {
      const { db, ensureSchema } = await import("@/db/client");
      const { automationFlows } = await import("@/db/schema");
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

        const id = body.id || `flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date();

        const newFlow = {
          id,
          name: body.name || "Custom Automation Flow",
          desc: body.desc || null,
          category: body.category || "local",
          cadence: body.cadence || "weekly",
          status: body.status || "running",
          icon: body.icon || "Zap",
          accent: body.accent || "from-cyan-400 to-sky-500",
          lastRun: "Just created",
          successRate: 100,
          assignedAgents: body.assignedAgents || [],
          createdAt: now,
          updatedAt: now,
        };

        await d.insert(automationFlows).values(newFlow);
        return { success: true, flow: newFlow };
      }

      // Default GET
      const flowsList = await d.select().from(automationFlows).orderBy(desc(automationFlows.createdAt));

      return { flows: flowsList };
    } catch (err: any) {
      return { error: err.message || "Failed to process automation flows request" };
    }
  },
  component: () => null,
});
