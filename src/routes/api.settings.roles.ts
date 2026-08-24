import { createFileRoute } from "@tanstack/react-router";
import { randomBytes, scryptSync } from "node:crypto";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

const SCRYPT_PREFIX = "scrypt$";
const SCRYPT_KEYLEN = 64;

// Invited members have no login flow yet (no session system exists in this
// app) -- they get an unusable random password hash as a placeholder rather
// than a blank/fake one, matching the pattern already used in db/seed.ts.
function randomUnusablePasswordHash(): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(randomBytes(32).toString("hex"), salt, SCRYPT_KEYLEN).toString("hex");
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

export const Route = createFileRoute("/api/settings/roles")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { users } = await import("@/db/schema");
          const { asc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const rows = await d
            .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
            .from(users)
            .orderBy(asc(users.createdAt));

          return Response.json({ ok: true, users: rows });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const email = (body.email as string || "").trim().toLowerCase();
          const role = (body.role as string) || "viewer";
          if (!email) {
            return Response.json({ ok: false, error: "email is required" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { users } = await import("@/db/schema");

          await ensureSchema();
          const d = db();
          const [created] = await d
            .insert(users)
            .values({
              email,
              name: body.name || null,
              role: role as any,
              passwordHash: randomUnusablePasswordHash(),
            })
            .returning();

          await logAudit(actorEmailFromRequest(request), "role.invited", { email, role });

          return Response.json({
            ok: true,
            user: { id: created.id, email: created.email, name: created.name, role: created.role, createdAt: created.createdAt },
          });
        } catch (err: any) {
          const isDuplicate = /unique|duplicate/i.test(err.message || "");
          return Response.json(
            { ok: false, error: isDuplicate ? "A member with this email already exists" : err.message },
            { status: isDuplicate ? 409 : 500 },
          );
        }
      },
    },
  },
});
