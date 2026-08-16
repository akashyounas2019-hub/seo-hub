"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { apiKeys, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function createSiteAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const slug = s(formData, "slug").toLowerCase();
  const name = s(formData, "name");
  const domain = s(formData, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const city = s(formData, "city") || null;
  const region = s(formData, "region") || null;

  if (!slug || !name || !domain || !SLUG_RE.test(slug)) {
    redirect("/admin/sites/new?error=invalid");
  }

  const existingSlug = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (existingSlug.length) redirect("/admin/sites/new?error=slug-exists");

  const existingDomain = await db().select().from(sites).where(eq(sites.domain, domain)).limit(1);
  if (existingDomain.length) redirect("/admin/sites/new?error=domain-exists");

  const [created] = await db()
    .insert(sites)
    .values({ slug, name, domain, city, region })
    .returning({ id: sites.id, slug: sites.slug });

  // Auto-create first API key on site creation so it's immediately usable.
  const keyId = `gyl_${slug.replace(/-/g, "_")}_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  await db().insert(apiKeys).values({ siteId: created.id, keyId, secret, active: true });

  await recordAdminAction({
    actor: me,
    kind: "site.create",
    targetType: "site",
    targetId: created.id,
    summary: `Created site ${slug} (${domain})`,
    after: { slug, name, domain, city, region, initialKeyId: keyId },
  });

  revalidatePath("/admin/sites");
  redirect(`/admin/sites/${created.slug}?ok=created&newKey=1`);
}

export async function updateSiteAction(slug: string, formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const name = s(formData, "name");
  const domain = s(formData, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const city = s(formData, "city") || null;
  const region = s(formData, "region") || null;
  if (!name || !domain) redirect(`/admin/sites/${slug}?error=invalid`);

  const [before] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);

  await db()
    .update(sites)
    .set({ name, domain, city, region, updatedAt: new Date() })
    .where(eq(sites.slug, slug));

  await recordAdminAction({
    actor: me,
    kind: "site.update",
    targetType: "site",
    targetId: before?.id ?? slug,
    summary: `Updated site ${slug}`,
    before: before ? { name: before.name, domain: before.domain, city: before.city, region: before.region } : null,
    after: { name, domain, city, region },
  });

  revalidatePath(`/admin/sites/${slug}`);
  redirect(`/admin/sites/${slug}?ok=saved`);
}

/**
 * Save the site's AI knowledge base — freeform text injected into the chat
 * widget's system prompt so the assistant can answer service-area / fleet /
 * policy / hours / FAQ questions. Edited at /admin/sites/<slug>.
 *
 * Hard limit of 8 KB to keep the system prompt token budget reasonable; the
 * UI shows the live character count and warns past 6 KB.
 */
export async function updateSiteKnowledgeAction(slug: string, formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const raw = (formData.get("knowledge_base") ?? "").toString();
  const knowledgeBase = raw.trim().slice(0, 8192) || null;

  const [before] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!before) redirect("/admin/sites?error=not-found");

  await db()
    .update(sites)
    .set({ knowledgeBase, updatedAt: new Date() })
    .where(eq(sites.slug, slug));

  await recordAdminAction({
    actor: me,
    kind: "site.knowledge_update",
    targetType: "site",
    targetId: before.id,
    summary: `Updated AI knowledge base for ${slug} (${knowledgeBase ? knowledgeBase.length : 0} chars)`,
    after: { length: knowledgeBase?.length ?? 0 },
  });

  revalidatePath(`/admin/sites/${slug}`);
  redirect(`/admin/sites/${slug}?ok=knowledge`);
}

export async function rotateApiKeyAction(slug: string) {
  await ensureSchema();
  const me = await requireAdmin();
  const [site] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) redirect("/admin/sites?error=not-found");

  // Deactivate all existing keys, create a new active one.
  await db().update(apiKeys).set({ active: false }).where(eq(apiKeys.siteId, site.id));
  const keyId = `gyl_${slug.replace(/-/g, "_")}_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  await db().insert(apiKeys).values({ siteId: site.id, keyId, secret, active: true });

  await recordAdminAction({
    actor: me,
    kind: "key.rotate",
    targetType: "site",
    targetId: site.id,
    summary: `Rotated API key for site ${slug}; new keyId=${keyId}`,
    after: { keyId },
  });

  revalidatePath(`/admin/sites/${slug}`);
  redirect(`/admin/sites/${slug}?ok=key-rotated&newKey=1`);
}

export async function revokeApiKeyAction(slug: string, formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const keyId = s(formData, "keyId");
  const [site] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site || !keyId) redirect(`/admin/sites/${slug}?error=invalid`);

  await db()
    .update(apiKeys)
    .set({ active: false })
    .where(and(eq(apiKeys.siteId, site.id), eq(apiKeys.keyId, keyId)));

  await recordAdminAction({
    actor: me,
    kind: "key.revoke",
    targetType: "site",
    targetId: site.id,
    summary: `Revoked API key ${keyId} for site ${slug}`,
    before: { keyId },
  });

  revalidatePath(`/admin/sites/${slug}`);
  redirect(`/admin/sites/${slug}?ok=key-revoked`);
}

export async function deleteSiteAction(slug: string) {
  await ensureSchema();
  const me = await requireAdmin();
  const [site] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  await db().delete(sites).where(eq(sites.slug, slug));
  await recordAdminAction({
    actor: me,
    kind: "site.delete",
    targetType: "site",
    targetId: site?.id ?? slug,
    summary: `Deleted site ${slug}${site ? ` (${site.domain})` : ""}`,
    before: site ? { slug: site.slug, name: site.name, domain: site.domain } : null,
  });
  revalidatePath("/admin/sites");
  redirect("/admin/sites?ok=deleted");
}
