import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

const ALLOWED_FIELDS = [
  "name",
  "domain",
  "city",
  "region",
  "knowledgeBase",
  "structuredKb",
  "health",
  "pagesTotal",
  "pagesIndexed",
  "openFixes",
  "gaConnected",
  "gaPropertyId",
  "gaPropertyLabel",
  "gscConnected",
  "gscPropertyUrl",
  "gbpConnected",
  "gbpLocationName",
  "wpConnected",
  "wpDetail",
  "businessCategory",
];

export const Route = createFileRoute("/api/sites/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const [site] = await d.select().from(sites).where(eq(sites.id, params.id)).limit(1);
          return Response.json({ ok: true, site: site || null });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      PATCH: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const updates: Record<string, any> = { updatedAt: new Date() };
          for (const key of ALLOWED_FIELDS) {
            if (body[key] !== undefined) updates[key] = body[key];
          }

          await d.update(sites).set(updates).where(eq(sites.id, params.id));
          const [updated] = await d.select().from(sites).where(eq(sites.id, params.id)).limit(1);

          const changedFields = Object.keys(updates).filter((k) => k !== "updatedAt");
          if (changedFields.length > 0) {
            await logAudit(actorEmailFromRequest(request), "site.updated", { siteId: params.id, fields: changedFields });
          }

          return Response.json({ ok: true, site: updated || null });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      DELETE: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(sites).where(eq(sites.id, params.id));
          await logAudit(actorEmailFromRequest(request), "site.deleted", { siteId: params.id });
          return Response.json({ ok: true, siteId: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
