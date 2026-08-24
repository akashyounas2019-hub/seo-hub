import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/settings/roles/$id")({
  server: {
    handlers: {
      PATCH: async ({ params, request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }
          const role = body.role as string;
          if (!role) {
            return Response.json({ ok: false, error: "role is required" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { users } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.update(users).set({ role: role as any }).where(eq(users.id, params.id));

          await logAudit(actorEmailFromRequest(request), "role.changed", { userId: params.id, role });

          return Response.json({ ok: true, userId: params.id, role });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      DELETE: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { users } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          await d.delete(users).where(eq(users.id, params.id));

          await logAudit(actorEmailFromRequest(request), "role.removed", { userId: params.id });

          return Response.json({ ok: true, userId: params.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
