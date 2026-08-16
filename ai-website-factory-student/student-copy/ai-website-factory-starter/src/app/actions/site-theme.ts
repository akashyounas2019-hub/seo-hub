"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteThemes, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { extractTheme } from "@/lib/brand-extractor";
import { requireAdmin } from "@/lib/server-auth";
import { callPlugin, WpPluginError } from "@/lib/wp-plugin-client";

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Re-run extraction on the site's homepage. Saves the result but does NOT
 * auto-push to the plugin — admin reviews first, then clicks Apply.
 */
export async function extractSiteThemeAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteId = s(formData, "siteId");
  if (!siteId) redirect("/admin/sites?error=no-site");

  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) redirect(`/admin/sites?error=not-found`);

  const extracted = await extractTheme(site.domain);

  await db()
    .insert(siteThemes)
    .values({
      siteId,
      primaryColor: extracted.primary,
      primaryText: extracted.primary_text,
      surface: extracted.surface,
      surfaceText: extracted.surface_text,
      accent: extracted.accent,
      border: extracted.border,
      fontFamilyBody: extracted.font_family_body,
      fontFamilyHeading: extracted.font_family_heading,
      borderRadiusPx: extracted.border_radius_px,
      mode: extracted.mode,
      source: extracted.source,
      extractionMeta: extracted.extraction_meta,
    })
    .onConflictDoUpdate({
      target: siteThemes.siteId,
      set: {
        primaryColor: extracted.primary,
        primaryText: extracted.primary_text,
        surface: extracted.surface,
        surfaceText: extracted.surface_text,
        accent: extracted.accent,
        border: extracted.border,
        fontFamilyBody: extracted.font_family_body,
        fontFamilyHeading: extracted.font_family_heading,
        borderRadiusPx: extracted.border_radius_px,
        mode: extracted.mode,
        source: extracted.source,
        extractionMeta: extracted.extraction_meta,
        updatedAt: new Date(),
        // Don't reset appliedAt — the admin can see "extracted but not yet pushed."
      },
    });

  await recordAdminAction({
    actor: me,
    kind: "site.theme_extracted",
    targetType: "site",
    targetId: siteId,
    summary: `Re-extracted brand theme for ${site.name} (source: ${extracted.source}).`,
  });

  revalidatePath(`/admin/sites/${site.slug}/brand`);
  redirect(`/admin/sites/${site.slug}/brand?ok=extracted`);
}

/** Save manual edits and (optionally) push to plugin. */
export async function saveSiteThemeAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteId = s(formData, "siteId");
  if (!siteId) redirect("/admin/sites?error=no-site");
  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) redirect(`/admin/sites?error=not-found`);

  const radiusRaw = parseInt(s(formData, "border_radius_px"), 10);
  const patch = {
    primaryColor: s(formData, "primary"),
    primaryText: s(formData, "primary_text"),
    surface: s(formData, "surface"),
    surfaceText: s(formData, "surface_text"),
    accent: s(formData, "accent"),
    border: s(formData, "border"),
    fontFamilyBody: s(formData, "font_family_body"),
    fontFamilyHeading: s(formData, "font_family_heading"),
    borderRadiusPx: Number.isFinite(radiusRaw) && radiusRaw >= 0 && radiusRaw <= 999 ? radiusRaw : 8,
    mode: (["light", "dark", "auto"].includes(s(formData, "mode")) ? s(formData, "mode") : "light") as "light" | "dark" | "auto",
    source: "manual" as const,
  };

  await db()
    .insert(siteThemes)
    .values({ siteId, ...patch })
    .onConflictDoUpdate({ target: siteThemes.siteId, set: { ...patch, updatedAt: new Date() } });

  await recordAdminAction({
    actor: me,
    kind: "site.theme_edited",
    targetType: "site",
    targetId: siteId,
    summary: `Manually edited brand theme for ${site.name}.`,
  });
  revalidatePath(`/admin/sites/${site.slug}/brand`);
  redirect(`/admin/sites/${site.slug}/brand?ok=saved`);
}

/** Push the saved theme to the WP plugin via signed theme_apply. */
export async function applySiteThemeAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteId = s(formData, "siteId");
  if (!siteId) redirect("/admin/sites?error=no-site");
  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) redirect(`/admin/sites?error=not-found`);
  const [theme] = await db().select().from(siteThemes).where(eq(siteThemes.siteId, siteId)).limit(1);
  if (!theme) redirect(`/admin/sites/${site.slug}/brand?error=no-theme`);

  let appliedAt: Date | null = null;
  let applyError: string | null = null;
  try {
    const resp = await callPlugin<{ ok: boolean; error?: string }>(siteId, {
      method: "POST",
      path: "/seo-apply",
      body: {
        kind: "theme_apply",
        theme: {
          primary: theme.primaryColor,
          primary_text: theme.primaryText,
          surface: theme.surface,
          surface_text: theme.surfaceText,
          accent: theme.accent,
          border: theme.border,
          font_family_body: theme.fontFamilyBody,
          font_family_heading: theme.fontFamilyHeading,
          border_radius_px: theme.borderRadiusPx,
          mode: theme.mode,
          source: theme.source,
        },
      },
    });
    if (resp.ok) appliedAt = new Date();
    else applyError = resp.error ?? "plugin returned ok:false";
  } catch (err) {
    applyError = err instanceof WpPluginError ? `${err.reason}: ${err.message}` : err instanceof Error ? err.message : String(err);
  }

  await db()
    .update(siteThemes)
    .set({ appliedAt, applyError, updatedAt: new Date() })
    .where(eq(siteThemes.siteId, siteId));

  await recordAdminAction({
    actor: me,
    kind: applyError ? "site.theme_apply_failed" : "site.theme_applied",
    targetType: "site",
    targetId: siteId,
    summary: applyError ? `Theme push failed: ${applyError}` : `Theme pushed to ${site.name} plugin.`,
  });
  revalidatePath(`/admin/sites/${site.slug}/brand`);
  redirect(`/admin/sites/${site.slug}/brand?${applyError ? "error=apply-failed" : "ok=applied"}`);
}
