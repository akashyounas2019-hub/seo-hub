"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sites, taskTemplates, tasks } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createTemplateAction(formData: FormData) {
  await ensureSchema();
  const user = await requireAdmin();

  const title = s(formData, "title");
  const description = s(formData, "description") || null;
  const cadence = s(formData, "cadence") || "weekly";
  const defaultAssigneeId = s(formData, "defaultAssigneeId") || null;
  const defaultPriority = (s(formData, "defaultPriority") || "normal") as Priority;
  const siteId = s(formData, "siteId") || null;
  const active = formData.get("active") !== null;

  if (!title || !PRIORITIES.includes(defaultPriority)) {
    redirect("/admin/templates/new?error=invalid");
  }

  const [created] = await db()
    .insert(taskTemplates)
    .values({
      title,
      description,
      cadence,
      defaultAssigneeId,
      defaultPriority,
      siteId,
      active,
    })
    .returning({ id: taskTemplates.id });

  await recordAdminAction({
    actor: user,
    kind: "template.create",
    targetType: "template",
    targetId: created.id,
    summary: `Created template: ${title} (${cadence})`,
    after: { title, cadence, defaultPriority, siteId, defaultAssigneeId, active },
  });

  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${created.id}?ok=created`);
}

export async function updateTemplateAction(templateId: string, formData: FormData) {
  await ensureSchema();
  const user = await requireAdmin();
  const [before] = await db().select().from(taskTemplates).where(eq(taskTemplates.id, templateId)).limit(1);
  if (!before) redirect("/admin/templates?error=not-found");

  const title = s(formData, "title");
  const description = s(formData, "description") || null;
  const cadence = s(formData, "cadence") || before.cadence;
  const defaultAssigneeId = s(formData, "defaultAssigneeId") || null;
  const defaultPriority = (s(formData, "defaultPriority") || "normal") as Priority;
  const siteId = s(formData, "siteId") || null;
  const active = formData.get("active") !== null;

  if (!title || !PRIORITIES.includes(defaultPriority)) {
    redirect(`/admin/templates/${templateId}?error=invalid`);
  }

  await db()
    .update(taskTemplates)
    .set({ title, description, cadence, defaultAssigneeId, defaultPriority, siteId, active })
    .where(eq(taskTemplates.id, templateId));

  await recordAdminAction({
    actor: user,
    kind: "template.update",
    targetType: "template",
    targetId: templateId,
    summary: `Updated template: ${title}`,
    before: {
      title: before.title,
      cadence: before.cadence,
      defaultPriority: before.defaultPriority,
      siteId: before.siteId,
      defaultAssigneeId: before.defaultAssigneeId,
      active: before.active,
    },
    after: { title, cadence, defaultPriority, siteId, defaultAssigneeId, active },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  redirect(`/admin/templates/${templateId}?ok=saved`);
}

export async function deleteTemplateAction(templateId: string) {
  await ensureSchema();
  const user = await requireAdmin();
  const [before] = await db().select().from(taskTemplates).where(eq(taskTemplates.id, templateId)).limit(1);
  if (!before) redirect("/admin/templates?error=not-found");
  await db().delete(taskTemplates).where(eq(taskTemplates.id, templateId));
  await recordAdminAction({
    actor: user,
    kind: "template.delete",
    targetType: "template",
    targetId: templateId,
    summary: `Deleted template: ${before.title}`,
    before,
  });
  revalidatePath("/admin/templates");
  redirect("/admin/templates?ok=deleted");
}

export async function runTemplateNowAction(templateId: string) {
  await ensureSchema();
  const user = await requireAdmin();
  const [tmpl] = await db().select().from(taskTemplates).where(eq(taskTemplates.id, templateId)).limit(1);
  if (!tmpl) redirect("/admin/templates?error=not-found");

  // null siteId = template applies to every site (per the schema comment).
  // We fan-out: create one task per site.
  let targetSiteIds: string[];
  if (tmpl.siteId) {
    targetSiteIds = [tmpl.siteId];
  } else {
    const allSites = await db().select({ id: sites.id }).from(sites);
    if (allSites.length === 0) {
      redirect(`/admin/templates/${templateId}?error=no-sites-exist`);
    }
    targetSiteIds = allSites.map((s) => s.id);
  }

  const inserted = await db()
    .insert(tasks)
    .values(
      targetSiteIds.map((siteId) => ({
        siteId,
        title: tmpl.title,
        description: tmpl.description,
        priority: tmpl.defaultPriority,
        assigneeId: tmpl.defaultAssigneeId,
        creatorId: user.id,
        templateId: tmpl.id,
      })),
    )
    .returning({ id: tasks.id });

  await db()
    .update(taskTemplates)
    .set({ lastRunAt: new Date() })
    .where(eq(taskTemplates.id, templateId));

  await recordAdminAction({
    actor: user,
    kind: "template.run",
    targetType: "template",
    targetId: templateId,
    summary: `Materialized template "${tmpl.title}" → ${inserted.length} task(s) across ${targetSiteIds.length} site(s)`,
    after: { taskIds: inserted.map((t) => t.id), templateId, siteCount: targetSiteIds.length },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  // If only one task created (single-site template), go straight to it. Otherwise back to the template.
  if (inserted.length === 1) {
    redirect(`/admin/tasks/${inserted[0].id}?ok=template-run`);
  }
  redirect(`/admin/templates/${templateId}?ok=template-run&count=${inserted.length}`);
}
