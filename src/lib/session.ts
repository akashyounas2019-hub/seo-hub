import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

// Real server-side session for the app's single shared master password.
// Previously the password was a plaintext constant shipped in the client JS
// bundle (src/lib/auth-context.tsx) and compared in the browser -- anyone
// could read it straight out of devtools. This verifies the password on the
// server against an env var and issues an httpOnly session token backed by
// the real `sessions` table (src/db/schema.ts), which already existed with
// no login flow ever wired to it.
//
// Scope note: this only protects the UI gate. No /api/* data route in this
// app currently checks the session cookie -- they're reachable directly by
// URL today regardless of this change, same as before. Gating every API
// route (including distinguishing browser calls from the AKS worker's own
// unauthenticated calls to /api/jobs/claim etc.) is a larger, separate
// change than "move the password check server-side."

const COOKIE_NAME = "aks_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// A `Secure` cookie is silently dropped by the browser on any connection it
// sees as plain HTTP -- previously this was gated on NODE_ENV === "production"
// alone, which is true in this app's Docker image regardless of whether a
// TLS-terminating proxy sits in front of it. In production today the app is
// exposed directly on port 3333 with no reverse proxy/TLS at all, so every
// login cookie was marked Secure over an insecure connection and never
// actually stored -- explaining sessions not surviving a new tab/window.
// Reads the real scheme the request arrived on (respecting a TLS-terminating
// proxy's X-Forwarded-Proto when present) so this is correct either way.
function isRequestSecure(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function getMasterPassword(): string {
  // Falls back to the app's historical shared password only if the env var
  // isn't set, so existing deployments don't get locked out on upgrade --
  // set AKS_MASTER_PASSWORD in the environment to actually rotate it.
  return process.env.AKS_MASTER_PASSWORD || "03335148974@Abu";
}

export function verifyMasterPassword(input: string): boolean {
  const expected = Buffer.from(getMasterPassword());
  const actual = Buffer.from(input || "");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(request: Request): Promise<{ token: string; cookie: string }> {
  const { db, ensureSchema } = await import("@/db/client");
  const { sessions, users } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  await ensureSchema();
  const d = db();

  // The shared-password gate has no per-user identity; anchor sessions to
  // the seeded admin account so the real users/sessions tables (which
  // otherwise sit unused) are the actual source of truth for who's logged
  // in, rather than inventing a second parallel session concept.
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  let [admin] = await d.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (!admin) {
    const { randomBytes: rb, scryptSync } = await import("node:crypto");
    const salt = rb(16).toString("hex");
    const derived = scryptSync(rb(32).toString("hex"), salt, 64).toString("hex");
    [admin] = await d
      .insert(users)
      .values({ email: adminEmail, passwordHash: `scrypt$${salt}$${derived}`, name: "Admin", role: "admin" })
      .returning();
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await d.insert(sessions).values({
    tokenHash,
    userId: admin.id,
    expiresAt,
    userAgent: request.headers.get("user-agent") || null,
    ip: request.headers.get("x-forwarded-for") || null,
  });

  await d.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, admin.id));

  const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${
    isRequestSecure(request) ? "; Secure" : ""
  }`;

  return { token, cookie };
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export async function isSessionValid(request: Request): Promise<boolean> {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return false;

  const { db, ensureSchema } = await import("@/db/client");
  const { sessions } = await import("@/db/schema");
  const { eq, gt, and } = await import("drizzle-orm");

  await ensureSchema();
  const d = db();
  const tokenHash = hashToken(token);
  const [row] = await d
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return !!row;
}

export async function destroySession(request: Request): Promise<void> {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return;

  const { db, ensureSchema } = await import("@/db/client");
  const { sessions } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  await ensureSchema();
  const d = db();
  await d.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
