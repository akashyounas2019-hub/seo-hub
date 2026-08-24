import { createFileRoute } from "@tanstack/react-router";

async function readSettings(d: any, orgSettings: any, eq: any) {
  const [row] = await d.select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);
  return {
    ok: true,
    settings: row
      ? {
          llmProviderPreference: row.llmProviderPreference,
          auditEnabled: row.auditEnabled,
          digestEnabled: row.digestEnabled,
        }
      : null,
  };
}

export const Route = createFileRoute("/api/settings/general")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { orgSettings } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const result = await readSettings(d, orgSettings, eq);
          return Response.json(result);
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load settings" }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { orgSettings } = await import("@/db/schema");
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
          if (body.llmProviderPreference !== undefined) updates.llmProviderPreference = body.llmProviderPreference;
          if (body.auditEnabled !== undefined) updates.auditEnabled = body.auditEnabled;
          if (body.digestEnabled !== undefined) updates.digestEnabled = body.digestEnabled;

          await d.update(orgSettings).set(updates).where(eq(orgSettings.id, "singleton"));

          const result = await readSettings(d, orgSettings, eq);
          return Response.json(result);
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to update settings" }, { status: 500 });
        }
      },
    },
  },
});
