import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/automation/flows")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { automationFlows } = await import("@/db/schema");
          const { desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const flowsList = await d.select().from(automationFlows).orderBy(desc(automationFlows.createdAt));
          return Response.json({ flows: flowsList });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process automation flows request" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { automationFlows } = await import("@/db/schema");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const id = body.id || `flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const now = new Date();

          // Honest baseline for a brand-new flow: it has never actually
          // run, so successRate is 0 and lastRun says so plainly -- this
          // used to hardcode successRate: 100 regardless of reality,
          // fabricating a perfect track record for something with zero
          // executions.
          const newFlow = {
            id,
            name: body.name || "Custom Automation Flow",
            desc: body.desc || null,
            category: body.category || "local",
            cadence: body.cadence || "weekly",
            status: body.status || "running",
            icon: body.icon || "Zap",
            accent: body.accent || "from-cyan-400 to-sky-500",
            lastRun: "Never run",
            successRate: 0,
            assignedAgents: body.assignedAgents || [],
            createdAt: now,
            updatedAt: now,
          };

          await d.insert(automationFlows).values(newFlow);
          return Response.json({ success: true, flow: newFlow });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process automation flows request" }, { status: 500 });
        }
      },
    },
  },
});
