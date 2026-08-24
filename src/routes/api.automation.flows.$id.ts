import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/automation/flows/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { automationFlows } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const existing = await d.select().from(automationFlows).where(eq(automationFlows.id, params.id)).limit(1);
          return Response.json({ flow: existing[0] || null });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process automation flow request" }, { status: 500 });
        }
      },
      PATCH: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { automationFlows, claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const existing = await d.select().from(automationFlows).where(eq(automationFlows.id, params.id)).limit(1);

          if (existing.length === 0) {
            return Response.json({ error: "Flow not found" }, { status: 404 });
          }

          const flow = existing[0];
          let jobId: string | undefined = undefined;

          // If toggling status to running, queue an execution job in claude_jobs
          if (body.status === "running" && flow.status !== "running") {
            const [job] = await d.insert(claudeJobs).values({
              kind: "automation_flow_execution",
              title: `Execute Flow: ${flow.name}`,
              input: { flowId: params.id, category: flow.category, cadence: flow.cadence, desc: flow.desc },
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

          await d.update(automationFlows).set(updates).where(eq(automationFlows.id, params.id));
          return Response.json({ success: true, flowId: params.id, updates, jobId });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process automation flow request" }, { status: 500 });
        }
      },
      DELETE: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { automationFlows } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(automationFlows).where(eq(automationFlows.id, params.id));
          return Response.json({ success: true, flowId: params.id });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to process automation flow request" }, { status: 500 });
        }
      },
    },
  },
});
