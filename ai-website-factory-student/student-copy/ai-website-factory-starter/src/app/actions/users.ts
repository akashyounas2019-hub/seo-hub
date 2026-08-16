"use server";

import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { inviteTokens, sessions, siteUsers, sites, tasks, users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { recordAdminAction } from "@/lib/audit-log";
import { publicBaseUrl } from "@/lib/site-url";
import { requireAdmin } from "@/lib/server-auth";
import { sessionCookieOptions } from "@/lib/server-auth";

const USER_ROLES = ["admin", "manager", "student"] as const;
const SITE_ROLES = ["manager", "worker"] as const;
type UserRole = (typeof USER_ROLES)[number];
type SiteRole = (typeof SITE_ROLES)[number];

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Returns true if there is at least one other admin (besides `excludingId`).
 * Used to prevent demoting/deleting the only remaining admin and locking
 * everyone out.
 */
async function hasOtherAdmin(excludingId: string): Promise<boolean> {
  const others = await db()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), ne(users.id, excludingId)))
    .limit(1);
  return others.length > 0;
}

/**
 * Returns the count of open (non-done, non-cancelled) tasks currently
 * assigned to a user. Used for orphan-preview on delete.
 */
async function openTaskCountForAssignee(userId: string): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(eq(tasks.assigneeId, userId), sql`${tasks.status} not in ('done','cancelled')`),
    );
  return row?.n ?? 0;
}

export async function createUserAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const email = s(formData, "email").toLowerCase();
  const password = s(formData, "password");
  const name = s(formData, "name") || null;
  const role = s(formData, "role") as UserRole;

  if (!email || !password || password.length < 8 || !USER_ROLES.includes(role)) {
    redirect("/admin/users/new?error=invalid");
  }

  const existing = await db().select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) redirect("/admin/users/new?error=exists");

  const [inserted] = await db()
    .insert(users)
    .values({
      email,
      name,
      role,
      passwordHash: hashPassword(password),
    })
    .returning({ id: users.id, email: users.email });

  await recordAdminAction({
    actor: me,
    kind: "user.create",
    targetType: "user",
    targetId: inserted.id,
    summary: `Created user ${email} with role=${role}`,
    after: { email, name, role },
  });

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

/**
 * Create a user with a random placeholder password and a single-use invite
 * link the admin can hand to the new user. The placeholder password is 64
 * random bytes so it's not guessable; the only way in is via the invite
 * link until accepted.
 *
 * Invite tokens are stored hashed (sha256) so a DB leak cannot resurrect a
 * pending invite. The raw token only lives in the URL the admin shares.
 *
 * On success, redirects to the users list with the full URL in `?link=`
 * so the admin can copy it.
 */
export async function inviteUserAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const email = s(formData, "email").toLowerCase();
  const name = s(formData, "name") || null;
  const role = s(formData, "role") as UserRole;

  if (!email || !USER_ROLES.includes(role)) {
    redirect("/admin/users/new?error=invalid");
  }

  const existing = await db().select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) redirect("/admin/users/new?error=exists");

  // Random 64-char placeholder so the row passes NOT NULL on password_hash
  // but nobody can sign in with it. The invite flow replaces it.
  const placeholder = randomBytes(48).toString("base64url"); // ~64 chars
  const [inserted] = await db()
    .insert(users)
    .values({
      email,
      name,
      role,
      passwordHash: hashPassword(placeholder),
    })
    .returning({ id: users.id, email: users.email });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await db().insert(inviteTokens).values({
    tokenHash,
    userId: inserted.id,
    createdBy: me.id,
    expiresAt,
  });

  const link = `${publicBaseUrl()}/onboard/${rawToken}`;

  await recordAdminAction({
    actor: me,
    kind: "user.invite",
    targetType: "user",
    targetId: inserted.id,
    summary: `Invited ${email} as ${role} (link expires ${expiresAt.toISOString()})`,
    after: { email, name, role, expiresAt: expiresAt.toISOString() },
  });

  revalidatePath("/admin/users");
  redirect(`/admin/users?ok=invited&link=${encodeURIComponent(link)}`);
}

/**
 * Public-facing invite acceptance. Validates the token (not consumed, not
 * expired), sets the user's password, marks the token consumed, kills any
 * prior sessions, and starts a fresh logged-in session.
 *
 * No requireAdmin / requireUser — this is the unauthenticated entry point
 * for new workers.
 */
export async function acceptInviteAction(token: string, formData: FormData) {
  await ensureSchema();
  const password = s(formData, "password");
  const confirm = s(formData, "confirm");
  if (password.length < 8) redirect(`/onboard/${token}?error=pw-short`);
  if (password !== confirm) redirect(`/onboard/${token}?error=pw-mismatch`);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [invite] = await db()
    .select()
    .from(inviteTokens)
    .where(
      and(
        eq(inviteTokens.tokenHash, tokenHash),
        isNull(inviteTokens.consumedAt),
        gt(inviteTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!invite) redirect(`/onboard/${token}?error=invalid`);

  const [user] = await db().select().from(users).where(eq(users.id, invite.userId)).limit(1);
  if (!user) redirect(`/onboard/${token}?error=invalid`);

  // Set password + consume token + revoke any sessions in one logical step.
  await db().update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, user.id));
  await db()
    .update(inviteTokens)
    .set({ consumedAt: new Date() })
    .where(eq(inviteTokens.tokenHash, tokenHash));
  await db().delete(sessions).where(eq(sessions.userId, user.id));

  const h = headers();
  const userAgent = h.get("user-agent");
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const { token: sessionToken, expiresAt } = await createSession(user.id, { userAgent, ip });
  await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  cookies().set({ ...sessionCookieOptions(expiresAt), value: sessionToken });

  await recordAdminAction({
    actor: { id: user.id, email: user.email },
    kind: "user.invite_accepted",
    targetType: "user",
    targetId: user.id,
    summary: `Accepted invite and set initial password for ${user.email}`,
  });

  redirect("/admin/me");
}

export async function updateUserAction(userId: string, formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const name = s(formData, "name") || null;
  const role = s(formData, "role") as UserRole;
  if (!USER_ROLES.includes(role)) redirect(`/admin/users/${userId}?error=role`);

  const [target] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) redirect("/admin/users?error=not-found");

  // Guard: don't let admin demote themselves (would lock them out).
  if (userId === me.id && role !== "admin") {
    redirect(`/admin/users/${userId}?error=self-demote`);
  }

  // Guard: never let the last remaining admin be demoted away by anyone.
  if (target.role === "admin" && role !== "admin") {
    const safe = await hasOtherAdmin(userId);
    if (!safe) redirect(`/admin/users/${userId}?error=last-admin`);
  }

  await db().update(users).set({ name, role }).where(eq(users.id, userId));

  await recordAdminAction({
    actor: me,
    kind: "user.update",
    targetType: "user",
    targetId: userId,
    summary: `Updated user ${target.email}: name=${target.name ?? ""}→${name ?? ""}, role=${target.role}→${role}`,
    before: { name: target.name, role: target.role },
    after: { name, role },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  redirect(`/admin/users/${userId}?ok=saved`);
}

export async function resetPasswordAction(userId: string, formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const password = s(formData, "password");
  if (password.length < 8) redirect(`/admin/users/${userId}?error=pw-short`);

  const [target] = await db().select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) redirect("/admin/users?error=not-found");

  await db().update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, userId));
  // Revoke all existing sessions when the password rotates.
  await db().delete(sessions).where(eq(sessions.userId, userId));

  await recordAdminAction({
    actor: me,
    kind: "user.password_reset",
    targetType: "user",
    targetId: userId,
    summary: `Reset password for ${target.email} and revoked all sessions`,
  });

  redirect(`/admin/users/${userId}?ok=password-reset`);
}

/**
 * Delete a user. When called from the `/admin/users/[id]/delete` confirm page
 * we pass a `formData` with `confirmEmail` to enforce typed confirmation; the
 * field is optional so existing callers (which don't pass formData) still
 * work, but the confirm page always sends it.
 */
export async function deleteUserAction(userId: string, formData?: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  if (userId === me.id) redirect("/admin/users?error=self-delete");

  const [target] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) redirect("/admin/users?error=not-found");

  // If the form sent a confirmEmail (the typed-confirm path), enforce it.
  if (formData) {
    const typed = s(formData, "confirmEmail").toLowerCase();
    if (typed && typed !== target.email.toLowerCase()) {
      redirect(`/admin/users/${userId}/delete?error=mismatch`);
    }
  }

  // Last-admin guard
  if (target.role === "admin") {
    const safe = await hasOtherAdmin(userId);
    if (!safe) redirect(`/admin/users/${userId}?error=last-admin`);
  }

  const orphanedTasks = await openTaskCountForAssignee(userId);

  await db().delete(users).where(eq(users.id, userId));

  await recordAdminAction({
    actor: me,
    kind: "user.delete",
    targetType: "user",
    targetId: userId,
    summary: `Deleted user ${target.email} (role=${target.role}); ${orphanedTasks} open task(s) became unassigned`,
    before: { email: target.email, name: target.name, role: target.role, orphanedTasks },
  });

  revalidatePath("/admin/users");
  redirect(`/admin/users?ok=deleted&orphaned=${orphanedTasks}`);
}

/**
 * Read-only helper used by the user-delete confirm page to show a preview
 * of what will be orphaned. Admin-only.
 */
export async function previewUserDeleteImpact(userId: string): Promise<{
  email: string;
  role: string;
  openTasks: number;
  siteCount: number;
  isLastAdmin: boolean;
}> {
  await ensureSchema();
  await requireAdmin();
  const [target] = await db().select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new Error("not-found");
  const [openTasks, siteCountRow, otherAdmins] = await Promise.all([
    openTaskCountForAssignee(userId),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(siteUsers)
      .where(eq(siteUsers.userId, userId)),
    db()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, userId)))
      .limit(1),
  ]);
  return {
    email: target.email,
    role: target.role,
    openTasks,
    siteCount: siteCountRow[0]?.n ?? 0,
    isLastAdmin: target.role === "admin" && otherAdmins.length === 0,
  };
}

export async function assignSiteAction(userId: string, formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const siteId = s(formData, "siteId");
  const role = s(formData, "role") as SiteRole;
  if (!siteId || !SITE_ROLES.includes(role)) {
    redirect(`/admin/users/${userId}?error=assign`);
  }
  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) redirect(`/admin/users/${userId}?error=site`);

  const existing = await db()
    .select()
    .from(siteUsers)
    .where(and(eq(siteUsers.siteId, siteId), eq(siteUsers.userId, userId)))
    .limit(1);

  const prevRole = existing[0]?.role ?? null;
  if (existing.length) {
    await db()
      .update(siteUsers)
      .set({ role })
      .where(and(eq(siteUsers.siteId, siteId), eq(siteUsers.userId, userId)));
  } else {
    await db().insert(siteUsers).values({ siteId, userId, role });
  }
  await recordAdminAction({
    actor: me,
    kind: prevRole ? "site_user.update" : "site_user.create",
    targetType: "user",
    targetId: userId,
    summary: `${prevRole ? "Changed role to" : "Assigned to"} site ${site.slug} as ${role}`,
    before: prevRole ? { siteId, role: prevRole } : null,
    after: { siteId, role },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath(`/admin/sites/${site.slug}`);
  redirect(`/admin/users/${userId}?ok=assigned`);
}

export async function unassignSiteAction(userId: string, formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const siteId = s(formData, "siteId");
  if (!siteId) redirect(`/admin/users/${userId}?error=unassign`);
  await db()
    .delete(siteUsers)
    .where(and(eq(siteUsers.siteId, siteId), eq(siteUsers.userId, userId)));
  await recordAdminAction({
    actor: me,
    kind: "site_user.delete",
    targetType: "user",
    targetId: userId,
    summary: `Removed from site (siteId=${siteId})`,
  });
  revalidatePath(`/admin/users/${userId}`);
  redirect(`/admin/users/${userId}?ok=unassigned`);
}
