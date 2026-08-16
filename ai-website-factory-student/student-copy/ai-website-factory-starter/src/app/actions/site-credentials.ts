"use server";

/**
 * Site credentials — save / verify / revoke.
 *
 * Save always re-verifies before storing; if the credential doesn't pass
 * GET /wp/v2/users/me, we surface the WP error and store nothing. This
 * keeps the vault honest — a row exists iff the agent could log in with it.
 */
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { siteCredentials, sites } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { requireAdmin } from "@/lib/server-auth";
import { verifyAppPassword } from "@/lib/wp-rest-client";

export async function saveSiteCredential(input: {
  siteId: string;
  username: string;
  appPassword: string;
}): Promise<{ ok: boolean; status?: string; error?: string; user?: { id: number; name?: string; slug?: string } }> {
  await ensureSchema();
  const me = await requireAdmin();
  const username = input.username.trim();
  const appPassword = input.appPassword.replace(/\s+/g, ""); // WP shows it spaced, accept either
  if (!username || !appPassword) return { ok: false, error: "missing-fields" };
  if (appPassword.length < 18) return { ok: false, error: "app-password-too-short" };

  const [site] = await db().select({ domain: sites.domain }).from(sites).where(eq(sites.id, input.siteId)).limit(1);
  if (!site) return { ok: false, error: "site-not-found" };

  const verify = await verifyAppPassword({ domain: site.domain, username, password: appPassword });
  if (verify.status !== "ok") {
    return { ok: false, status: verify.status, error: verify.error ?? "verify failed" };
  }

  // Upsert: revoke any prior active row, then insert fresh.
  await db().update(siteCredentials).set({
    revokedAt: new Date(),
    revokedBy: me.id,
    updatedAt: new Date(),
  }).where(and(
    eq(siteCredentials.siteId, input.siteId),
    eq(siteCredentials.kind, "wp_app_password"),
    isNull(siteCredentials.revokedAt),
  ));

  await db().insert(siteCredentials).values({
    siteId: input.siteId,
    kind: "wp_app_password",
    username,
    secretCiphertext: encrypt(appPassword, "generic"),
    verifiedAt: new Date(),
    verifyStatus: "ok",
    createdBy: me.id,
  });

  revalidatePath(`/admin/sites`);
  return { ok: true, status: "ok", user: verify.user };
}

export async function verifyExistingCredential(siteId: string): Promise<{ ok: boolean; status: string; error?: string }> {
  await ensureSchema();
  await requireAdmin();
  const [site] = await db().select({ domain: sites.domain }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return { ok: false, status: "site-not-found" };

  const [cred] = await db().select().from(siteCredentials).where(and(
    eq(siteCredentials.siteId, siteId),
    eq(siteCredentials.kind, "wp_app_password"),
    isNull(siteCredentials.revokedAt),
  )).limit(1);
  if (!cred) return { ok: false, status: "no-credentials" };

  // Re-decrypt + re-verify.
  const { decrypt } = await import("@/lib/crypto");
  const password = decrypt(cred.secretCiphertext);
  const verify = await verifyAppPassword({ domain: site.domain, username: cred.username, password });

  await db().update(siteCredentials).set({
    verifiedAt: verify.status === "ok" ? new Date() : cred.verifiedAt,
    verifyStatus: verify.status,
    verifyError: verify.status === "ok" ? null : (verify.error?.slice(0, 500) ?? null),
    updatedAt: new Date(),
  }).where(eq(siteCredentials.id, cred.id));

  revalidatePath(`/admin/sites`);
  return { ok: verify.status === "ok", status: verify.status, error: verify.error };
}

export async function revokeSiteCredential(siteId: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  const me = await requireAdmin();
  await db().update(siteCredentials).set({
    revokedAt: new Date(),
    revokedBy: me.id,
    updatedAt: new Date(),
  }).where(and(
    eq(siteCredentials.siteId, siteId),
    eq(siteCredentials.kind, "wp_app_password"),
    isNull(siteCredentials.revokedAt),
  ));
  revalidatePath(`/admin/sites`);
  return { ok: true };
}
