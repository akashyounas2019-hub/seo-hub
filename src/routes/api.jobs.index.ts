import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/jobs/")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { claudeJobs } = await import("@/db/schema");
          const { desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const jobs = await d.select().from(claudeJobs).orderBy(desc(claudeJobs.createdAt)).limit(200);
          return Response.json({ ok: true, jobs });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load jobs" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { claudeJobs } = await import("@/db/schema");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          if (!body.kind || !body.title) {
            return Response.json({ ok: false, error: "kind and title are required" }, { status: 400 });
          }

          const [job] = await d
            .insert(claudeJobs)
            .values({
              kind: body.kind,
              title: body.title,
              input: body.input || {},
              priority: body.priority || "normal",
              preferWorker: body.preferWorker || "any",
              triggerSource: body.createdBy || "web_ui",
            })
            .returning();

          return Response.json({ ok: true, job });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to create job" }, { status: 500 });
        }
      },
    },
  },
});
