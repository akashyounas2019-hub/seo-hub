"use server";

import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sessions, userPrefs, users } from "@/db/schema";
import { SESSION_COOKIE, hashPassword, hashSessionToken, verifyPassword } from "@/lib/auth";
import { recordAdminAction } from "@/lib/audit-log";
import { requireUser } from "@/lib/server-auth";

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

/**
 * Insert-or-update the user's pref row. We use a singleton-style upsert
 * (PK is user_id) so first save just creates the row.
 */
async function upsertPrefs(
  userId: string,
  patch: Partial<typeof userPrefs.$inferInsert>,
): Promise<void> {
  const existing = await db().select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
  if (existing.length) {
    await db()
      .update(userPrefs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(userPrefs.userId, userId));
  } else {
    await db().insert(userPrefs).values({ userId, ...patch });
  }
}

export async function updateMyProfileAction(formData: FormData) {
  await ensureSchema();
  const me = await requireUser();

  const name = s(formData, "name") || null;
  const timezone = s(formData, "timezone") || null;

  const before = { name: me.name, timezone: null as string | null };
  // Pull current timezone so the diff is honest.
  const [existingPrefs] = await db()
    .select({ timezone: userPrefs.timezone })
    .from(userPrefs)
    .where(eq(userPrefs.userId, me.id))
    .limit(1);
  before.timezone = existingPrefs?.timezone ?? null;

  await db().update(users).set({ name }).where(eq(users.id, me.id));
  await upsertPrefs(me.id, { timezone });

  await recordAdminAction({
    actor: me,
    kind: "user.self_profile_update",
    targetType: "user",
    targetId: me.id,
    summary: `Updated own profile: name=${before.name ?? ""}→${name ?? ""}, tz=${before.timezone ?? ""}→${timezone ?? ""}`,
    before,
    after: { name, timezone },
  });

  revalidatePath("/admin/me/settings");
  redirect("/admin/me/settings?ok=profile");
}

/**
 * Change my own password. Verifies the old password (via async
 * `verifyPassword`), then rotates the hash and revokes every OTHER session
 * for this user — the current session (the cookie this request carries)
 * stays alive so the user isn't logged out mid-form.
 */
export async function changeMyPasswordAction(formData: FormData) {
  await ensureSchema();
  const me = await requireUser();

  const current = s(formData, "current");
  const next = s(formData, "next");
  const confirm = s(formData, "confirm");

  if (!current || !next || next.length < 8) {
    redirect("/admin/me/settings?error=pw-short");
  }
  if (next !== confirm) redirect("/admin/me/settings?error=pw-mismatch");

  const ok = await verifyPassword(current, me.passwordHash);
  if (!ok) redirect("/admin/me/settings?error=pw-wrong");

  await db().update(users).set({ passwordHash: hashPassword(next) }).where(eq(users.id, me.id));

  // Preserve current cookie's session, kill the rest.
  const currentToken = cookies().get(SESSION_COOKIE)?.value ?? null;
  const currentHash = currentToken ? hashSessionToken(currentToken) : null;
  if (currentHash) {
    await db()
      .delete(sessions)
      .where(and(eq(sessions.userId, me.id), ne(sessions.tokenHash, currentHash)));
  } else {
    await db().delete(sessions).where(eq(sessions.userId, me.id));
  }

  await recordAdminAction({
    actor: me,
    kind: "user.self_password_change",
    targetType: "user",
    targetId: me.id,
    summary: `Changed own password; revoked all other sessions`,
  });

  revalidatePath("/admin/me/settings");
  redirect("/admin/me/settings?ok=password");
}

/**
 * Revoke every session for me OTHER than the one carrying this request.
 * Bound to the "Log out everywhere else" button on the settings page.
 */
export async function revokeOtherSessionsAction() {
  await ensureSchema();
  const me = await requireUser();
  const currentToken = cookies().get(SESSION_COOKIE)?.value ?? null;
  const currentHash = currentToken ? hashSessionToken(currentToken) : null;

  // Count what we're killing for the audit summary.
  const [n] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(
      currentHash
        ? and(eq(sessions.userId, me.id), ne(sessions.tokenHash, currentHash))
        : eq(sessions.userId, me.id),
    );

  if (currentHash) {
    await db()
      .delete(sessions)
      .where(and(eq(sessions.userId, me.id), ne(sessions.tokenHash, currentHash)));
  } else {
    await db().delete(sessions).where(eq(sessions.userId, me.id));
  }

  await recordAdminAction({
    actor: me,
    kind: "user.self_revoke_other_sessions",
    targetType: "user",
    targetId: me.id,
    summary: `Revoked ${n?.n ?? 0} other session(s)`,
  });

  revalidatePath("/admin/me/settings");
  redirect("/admin/me/settings?ok=sessions");
}

/**
 * Update the 5 booleans + digest_webhook_url. Webhook URL must be https://
 * if present (defense in depth — we POST sensitive digest content here).
 */
export async function updateMyPrefsAction(formData: FormData) {
  await ensureSchema();
  const me = await requireUser();

  const patch = {
    emailOnTaskAssigned: bool(formData, "emailOnTaskAssigned"),
    emailOnTaskComment: bool(formData, "emailOnTaskComment"),
    emailOnLeadAssigned: bool(formData, "emailOnLeadAssigned"),
    emailOnDailyDigest: bool(formData, "emailOnDailyDigest"),
    emailOnAiFlag: bool(formData, "emailOnAiFlag"),
    digestWebhookUrl: (s(formData, "digestWebhookUrl") || null) as string | null,
  };

  if (patch.digestWebhookUrl && !patch.digestWebhookUrl.startsWith("https://")) {
    redirect("/admin/me/settings?error=webhook-https");
  }

  const [before] = await db().select().from(userPrefs).where(eq(userPrefs.userId, me.id)).limit(1);
  await upsertPrefs(me.id, patch);

  await recordAdminAction({
    actor: me,
    kind: "user.self_prefs_update",
    targetType: "user",
    targetId: me.id,
    summary: `Updated notification preferences`,
    before: before ?? null,
    after: patch,
  });

  revalidatePath("/admin/me/settings");
  redirect("/admin/me/settings?ok=prefs");
}
