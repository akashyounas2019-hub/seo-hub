"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, ensureSchema } from "@/db/client";
import { alertRules, sites, users, type AlertRule } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { recordAdminAction } from "@/lib/audit-log";
import { RULE_KINDS, ruleKindDef } from "@/lib/alerts/rule-config";

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function listAlertRules(): Promise<AlertRule[]> {
  await ensureSchema();
  await requireAdmin();
  return db().select().from(alertRules).orderBy(alertRules.kind);
}

export async function listAlertRulePickerData(): Promise<{
  sites: { id: string; name: string }[];
  users: { id: string; email: string; name: string | null }[];
  kinds: typeof RULE_KINDS;
}> {
  await ensureSchema();
  await requireAdmin();
  const [siteRows, userRows] = await Promise.all([
    db().select({ id: sites.id, name: sites.name }).from(sites).orderBy(sites.name),
    db().select({ id: users.id, email: users.email, name: users.name }).from(users).orderBy(users.email),
  ]);
  return { sites: siteRows, users: userRows, kinds: RULE_KINDS };
}

function buildConfigFromForm(kind: string, formData: FormData): Record<string, unknown> {
  const def = ruleKindDef(kind);
  const config: Record<string, unknown> = {};
  for (const f of def?.fields ?? []) {
    const raw = s(formData, `field_${f.key}`);
    if (raw === "") continue;
    config[f.key] = f.type === "number" ? Number(raw) : raw;
  }
  return config;
}

export async function createAlertRuleAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const name = s(formData, "name");
  const kind = s(formData, "kind");
  const siteId = s(formData, "siteId") || null;
  const severityOverride = (s(formData, "severityOverride") || null) as AlertRule["severityOverride"];
  const notifyEmail = formData.get("notifyEmail") === "on";
  const notifyInApp = formData.get("notifyInApp") === "on";
  const notifyUserIds = formData.getAll("notifyUserIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  const enabled = formData.get("enabled") === "on";

  if (!name || !kind || !ruleKindDef(kind)) {
    redirect("/admin/alerts?error=bad-input");
  }

  const config = buildConfigFromForm(kind, formData);

  const [row] = await db()
    .insert(alertRules)
    .values({
      name,
      kind,
      enabled,
      siteId,
      config,
      severityOverride,
      notifyEmail,
      notifyInApp,
      notifyUserIds,
      createdBy: me.id,
    })
    .returning({ id: alertRules.id });

  await recordAdminAction({
    actor: me,
    kind: "alert_rule.created",
    targetType: "other",
    summary: `Created alert rule "${name}" (${kind})`,
  });

  revalidatePath("/admin/alerts");
  redirect(`/admin/alerts?ok=created&ruleId=${row.id}`);
}

export async function updateAlertRuleAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();

  const id = s(formData, "id");
  const name = s(formData, "name");
  const kind = s(formData, "kind");
  const siteId = s(formData, "siteId") || null;
  const severityOverride = (s(formData, "severityOverride") || null) as AlertRule["severityOverride"];
  const notifyEmail = formData.get("notifyEmail") === "on";
  const notifyInApp = formData.get("notifyInApp") === "on";
  const notifyUserIds = formData.getAll("notifyUserIds").filter((v): v is string => typeof v === "string" && v.length > 0);
  const enabled = formData.get("enabled") === "on";

  if (!id || !name || !kind || !ruleKindDef(kind)) {
    redirect("/admin/alerts?error=bad-input");
  }

  const config = buildConfigFromForm(kind, formData);

  await db()
    .update(alertRules)
    .set({
      name,
      kind,
      enabled,
      siteId,
      config,
      severityOverride,
      notifyEmail,
      notifyInApp,
      notifyUserIds,
      updatedAt: new Date(),
    })
    .where(eq(alertRules.id, id));

  await recordAdminAction({
    actor: me,
    kind: "alert_rule.updated",
    targetType: "other",
    summary: `Updated alert rule "${name}" (${kind})`,
  });

  revalidatePath("/admin/alerts");
  redirect("/admin/alerts?ok=updated");
}

export async function toggleAlertRuleAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) redirect("/admin/alerts?error=missing-id");
  const [row] = await db().select().from(alertRules).where(eq(alertRules.id, id)).limit(1);
  if (!row) redirect("/admin/alerts?error=not-found");

  await db().update(alertRules).set({ enabled: !row.enabled, updatedAt: new Date() }).where(eq(alertRules.id, id));
  await recordAdminAction({
    actor: me,
    kind: row.enabled ? "alert_rule.disabled" : "alert_rule.enabled",
    targetType: "other",
    summary: `${row.enabled ? "Disabled" : "Enabled"} alert rule "${row.name}"`,
  });
  revalidatePath("/admin/alerts");
  redirect("/admin/alerts?ok=toggled");
}

export async function deleteAlertRuleAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) redirect("/admin/alerts?error=missing-id");
  const [row] = await db().select().from(alertRules).where(eq(alertRules.id, id)).limit(1);
  if (!row) redirect("/admin/alerts?error=not-found");

  await db().delete(alertRules).where(eq(alertRules.id, id));
  await recordAdminAction({
    actor: me,
    kind: "alert_rule.deleted",
    targetType: "other",
    summary: `Deleted alert rule "${row.name}"`,
  });
  revalidatePath("/admin/alerts");
  redirect("/admin/alerts?ok=deleted");
}
