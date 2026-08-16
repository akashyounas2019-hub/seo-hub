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

function siteIdsFromForm(formData: FormData): string[] {
  const ids = formData.getAll("siteId");
  return ids.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Bulk extract — re-runs brand extraction across N selected sites and
 * saves the proposed themes. Doesn't push to plugins. Sites are
 * processed sequentially (~3-8s per site) so we don't fan out 15
 * Anthropic vision calls in parallel.
 */
export async function bulkExtractThemesAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const ids = siteIdsFromForm(formData);
  if (ids.length === 0) redirect("/admin/sites/brand?error=no-selection");

  let ok = 0;
  let failed = 0;
  for (const siteId of ids) {
    const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) { failed += 1; continue; }
    try {
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
          },
        });
      ok += 1;
    } catch (err) {
      console.error(`[bulk-extract] ${site.slug} failed:`, err);
      failed += 1;
    }
  }

  await recordAdminAction({
    actor: me,
    kind: "site.bulk_theme_extracted",
    targetType: "other",
    summary: `Bulk theme extraction — ${ok} ok, ${failed} failed across ${ids.length} sites.`,
  });
  revalidatePath("/admin/sites/brand");
  redirect(`/admin/sites/brand?ok=extracted&n=${ok}&failed=${failed}`);
}

/**
 * Bulk apply — pushes each selected site's saved theme to its WP plugin.
 * Sites without a saved theme are skipped (do an extract first).
 */
export async function bulkApplyThemesAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const ids = siteIdsFromForm(formData);
  if (ids.length === 0) redirect("/admin/sites/brand?error=no-selection");

  let ok = 0;
  let failed = 0;
  for (const siteId of ids) {
    const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
    const [theme] = await db().select().from(siteThemes).where(eq(siteThemes.siteId, siteId)).limit(1);
    if (!site || !theme) { failed += 1; continue; }
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
      if (resp.ok) {
        await db()
          .update(siteThemes)
          .set({ appliedAt: new Date(), applyError: null, updatedAt: new Date() })
          .where(eq(siteThemes.siteId, siteId));
        ok += 1;
      } else {
        const err = resp.error ?? "plugin returned ok:false";
        await db()
          .update(siteThemes)
          .set({ applyError: err, updatedAt: new Date() })
          .where(eq(siteThemes.siteId, siteId));
        failed += 1;
      }
    } catch (err) {
      const msg = err instanceof WpPluginError ? `${err.reason}: ${err.message}` : err instanceof Error ? err.message : String(err);
      await db()
        .update(siteThemes)
        .set({ applyError: msg, updatedAt: new Date() })
        .where(eq(siteThemes.siteId, siteId));
      failed += 1;
    }
  }

  await recordAdminAction({
    actor: me,
    kind: "site.bulk_theme_applied",
    targetType: "other",
    summary: `Bulk theme push — ${ok} ok, ${failed} failed across ${ids.length} sites.`,
  });
  revalidatePath("/admin/sites/brand");
  redirect(`/admin/sites/brand?ok=applied&n=${ok}&failed=${failed}`);
}
