"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { notifications } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireUser } from "@/lib/server-auth";

export async function markNotificationReadAction(id: string) {
  await ensureSchema();
  const user = await requireUser();
  await db()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, user.id)));
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  redirect("/admin/notifications");
}

export async function markAllReadAction() {
  await ensureSchema();
  const user = await requireUser();
  await db()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, user.id), isNull(notifications.readAt)));
  revalidatePath("/admin/notifications");
  revalidatePath("/admin");
  redirect("/admin/notifications");
}

export async function deleteNotificationAction(id: string) {
  await ensureSchema();
  const user = await requireUser();
  await db()
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.recipientId, user.id)));
  revalidatePath("/admin/notifications");
  redirect("/admin/notifications");
}

/**
 * Bulk-delete multiple notifications. Form must POST `ids` (one entry per
 * id, repeated). Scoped to the current user so a malicious POST can't
 * delete someone else's row.
 *
 * Preserves the existing kind filter (if any) on the redirect so the user
 * stays in the same view after the action.
 */
export async function bulkDeleteNotificationsAction(formData: FormData) {
  await ensureSchema();
  const user = await requireUser();
  const rawIds = formData.getAll("ids");
  const ids = rawIds
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, 500); // hard cap so a junk POST can't nuke huge ranges
  const kind = typeof formData.get("kind") === "string" ? String(formData.get("kind")) : "";

  if (ids.length > 0) {
    await db()
      .delete(notifications)
      .where(and(eq(notifications.recipientId, user.id), inArray(notifications.id, ids)));
    await recordAdminAction({
      actor: user,
      kind: "notification.bulk_delete",
      targetType: "other",
      summary: `Bulk-deleted ${ids.length} notification(s)`,
      before: { ids },
    });
  }
  revalidatePath("/admin/notifications");
  redirect(kind ? `/admin/notifications?kind=${encodeURIComponent(kind)}` : "/admin/notifications");
}
