import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/settings/audit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

          const { db, ensureSchema } = await import("@/db/client");
          const { auditLog } = await import("@/db/schema");
          const { desc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const rows = await d.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);

          return Response.json({ ok: true, entries: rows });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
