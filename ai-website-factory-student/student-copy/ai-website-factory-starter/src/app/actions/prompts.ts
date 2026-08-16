"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { promptTemplates, sops } from "@/db/schema";
import { PROMPT_SLOTS } from "@/lib/prompt-library";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "sop";
}

/** Save a NEW version of a prompt for a slot — bumps version + sets active. */
export async function savePromptAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const slot = s(formData, "slot");
  const body = s(formData, "body");
  const labelOverride = s(formData, "label");
  if (!slot || !body) return;

  const meta = PROMPT_SLOTS.find((sl) => sl.slot === slot);
  const label = labelOverride || meta?.label || slot;
  const description = meta?.description;

  // Next version
  const [last] = await db()
    .select({ v: sql<number>`coalesce(max(${promptTemplates.version}), 0)::int` })
    .from(promptTemplates)
    .where(eq(promptTemplates.slot, slot));
  const nextVersion = Number(last?.v ?? 0) + 1;

  // Demote any active version for this slot
  await db()
    .update(promptTemplates)
    .set({ isActive: false })
    .where(and(eq(promptTemplates.slot, slot), eq(promptTemplates.isActive, true)));

  await db().insert(promptTemplates).values({
    slot,
    label,
    description,
    body,
    isActive: true,
    version: nextVersion,
    createdBy: me.id,
  });

  await recordAdminAction({
    actor: me,
    kind: "prompt.save",
    targetType: "other",
    targetId: slot,
    summary: `Saved prompt ${slot} v${nextVersion}`,
  });
  revalidatePath("/admin/prompts");
  revalidatePath(`/admin/prompts/${slot}`);
}

/** Activate a specific (older) version. */
export async function activatePromptVersionAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) return;
  const [row] = await db().select().from(promptTemplates).where(eq(promptTemplates.id, id)).limit(1);
  if (!row) return;
  await db()
    .update(promptTemplates)
    .set({ isActive: false })
    .where(and(eq(promptTemplates.slot, row.slot), eq(promptTemplates.isActive, true)));
  await db()
    .update(promptTemplates)
    .set({ isActive: true })
    .where(eq(promptTemplates.id, id));
  await recordAdminAction({
    actor: me,
    kind: "prompt.activate",
    targetType: "other",
    targetId: row.slot,
    summary: `Activated ${row.slot} v${row.version}`,
  });
  revalidatePath(`/admin/prompts/${row.slot}`);
  revalidatePath("/admin/prompts");
}

// ====== SOPs ======

export async function createSopAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const title = s(formData, "title");
  const body = s(formData, "body");
  const category = s(formData, "category") || "general";
  const tagsRaw = s(formData, "tags");
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  if (!title) redirect("/admin/sops?error=missing-title");
  const slug = slugify(title) + "-" + Math.random().toString(36).slice(2, 6);
  await db().insert(sops).values({
    title,
    slug,
    category,
    body,
    tags,
    createdBy: me.id,
    updatedBy: me.id,
  });
  await recordAdminAction({
    actor: me,
    kind: "sop.create",
    targetType: "other",
    targetId: slug,
    summary: `Created SOP: ${title}`,
  });
  revalidatePath("/admin/sops");
  redirect(`/admin/sops/${slug}`);
}

export async function updateSopAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const slug = s(formData, "slug");
  if (!slug) return;
  const tagsRaw = s(formData, "tags");
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const update: Partial<typeof sops.$inferInsert> = {
    title: s(formData, "title"),
    category: s(formData, "category") || "general",
    body: s(formData, "body"),
    tags,
    pinned: formData.get("pinned") === "on",
    visibleToTeam: formData.get("visibleToTeam") === "on",
    updatedBy: me.id,
    updatedAt: new Date(),
  };
  await db().update(sops).set(update).where(eq(sops.slug, slug));
  await recordAdminAction({
    actor: me,
    kind: "sop.update",
    targetType: "other",
    targetId: slug,
    summary: `Updated SOP ${slug}`,
  });
  revalidatePath(`/admin/sops/${slug}`);
  revalidatePath("/admin/sops");
}

export async function deleteSopAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const slug = s(formData, "slug");
  if (!slug) return;
  await db().delete(sops).where(eq(sops.slug, slug));
  await recordAdminAction({
    actor: me,
    kind: "sop.delete",
    targetType: "other",
    targetId: slug,
    summary: `Deleted SOP ${slug}`,
  });
  revalidatePath("/admin/sops");
  redirect("/admin/sops");
}
