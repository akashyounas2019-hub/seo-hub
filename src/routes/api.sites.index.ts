import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sites/")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites } = await import("@/db/schema");
          const { asc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const rows = await d.select().from(sites).orderBy(asc(sites.createdAt));
          return Response.json({ ok: true, sites: rows });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load sites" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites } = await import("@/db/schema");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          if (!body.slug || !body.name || !body.domain) {
            return Response.json({ ok: false, error: "slug, name, and domain are required" }, { status: 400 });
          }

          const [created] = await d
            .insert(sites)
            .values({
              slug: body.slug,
              name: body.name,
              domain: body.domain,
              city: body.city || null,
              region: body.region || null,
            })
            .returning();

          return Response.json({ ok: true, site: created });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to create site" }, { status: 500 });
        }
      },
    },
  },
});
