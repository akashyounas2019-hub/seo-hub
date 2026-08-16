"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { webhookSubscribers } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createWebhookAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const label = s(formData, "label");
  const url = s(formData, "url");
  const events = s(formData, "events") || null;
  const secret = s(formData, "secret") || null;
  if (!label || !url || !/^https?:\/\//.test(url)) {
    redirect("/admin/webhooks?error=bad-input");
  }
  await db().insert(webhookSubscribers).values({ label, url, events, secret, active: true });
  await recordAdminAction({
    actor: me,
    kind: "webhook.created",
    targetType: "other",
    summary: `Added webhook "${label}" → ${url.slice(0, 60)}…`,
  });
  revalidatePath("/admin/webhooks");
  redirect("/admin/webhooks?ok=created");
}

export async function toggleWebhookAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) redirect("/admin/webhooks?error=missing-id");
  const [row] = await db().select().from(webhookSubscribers).where(eq(webhookSubscribers.id, id)).limit(1);
  if (!row) redirect("/admin/webhooks?error=not-found");
  await db().update(webhookSubscribers).set({ active: !row.active, updatedAt: new Date() }).where(eq(webhookSubscribers.id, id));
  await recordAdminAction({
    actor: me,
    kind: row.active ? "webhook.paused" : "webhook.resumed",
    targetType: "other",
    summary: `${row.active ? "Paused" : "Resumed"} webhook "${row.label}"`,
  });
  revalidatePath("/admin/webhooks");
  redirect("/admin/webhooks?ok=toggled");
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) redirect("/admin/webhooks?error=missing-id");
  const [row] = await db().select().from(webhookSubscribers).where(eq(webhookSubscribers.id, id)).limit(1);
  if (!row) redirect("/admin/webhooks?error=not-found");
  await db().delete(webhookSubscribers).where(eq(webhookSubscribers.id, id));
  await recordAdminAction({
    actor: me,
    kind: "webhook.deleted",
    targetType: "other",
    summary: `Deleted webhook "${row.label}"`,
  });
  revalidatePath("/admin/webhooks");
  redirect("/admin/webhooks?ok=deleted");
}
