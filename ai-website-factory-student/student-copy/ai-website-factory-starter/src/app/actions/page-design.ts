"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteThemes, sitePages, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { crawlPage } from "@/lib/seo-crawler";
import { proposePageDesign } from "@/lib/seo-agent-design";
import { requireAdmin } from "@/lib/server-auth";
import { callPlugin, WpPluginError } from "@/lib/wp-plugin-client";

interface DesignBlob {
  vars?: Record<string, string>;
  rules?: Array<{ selector: string; css: string }>;
  custom_css?: string;
}

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function buildBlobFromForm(formData: FormData): DesignBlob {
  // The editor surfaces a handful of common knobs as named fields.
  // Anything more advanced lives in the `custom_css` textarea.
  const vars: Record<string, string> = {};
  const knobs: Array<[string, string]> = [
    ["--gyl-page-cta-bg", "cta_bg"],
    ["--gyl-page-cta-color", "cta_color"],
    ["--gyl-page-cta-radius", "cta_radius"],
    ["--gyl-page-hero-bg", "hero_bg"],
    ["--gyl-page-hero-pad", "hero_pad"],
    ["--gyl-page-heading-color", "heading_color"],
    ["--gyl-page-body-color", "body_color"],
    ["--gyl-page-section-pad", "section_pad"],
  ];
  for (const [varName, fieldName] of knobs) {
    const v = s(formData, fieldName);
    if (v) vars[varName] = v;
  }
  const blob: DesignBlob = {};
  if (Object.keys(vars).length > 0) blob.vars = vars;
  const customCss = s(formData, "custom_css");
  if (customCss) blob.custom_css = customCss;
  return blob;
}

async function loadPage(siteSlug: string, postIdStr: string): Promise<{ site: typeof sites.$inferSelect; page: typeof sitePages.$inferSelect } | null> {
  const wpPostId = Number.parseInt(postIdStr, 10);
  if (!Number.isFinite(wpPostId)) return null;
  const [site] = await db().select().from(sites).where(eq(sites.slug, siteSlug)).limit(1);
  if (!site) return null;
  const [page] = await db()
    .select()
    .from(sitePages)
    .where(and(eq(sitePages.siteId, site.id), eq(sitePages.wpPostId, wpPostId)))
    .limit(1);
  if (!page) return null;
  return { site, page };
}

/** Save the current form values as a draft preview — returns a token URL. */
export async function previewPageDesignAction(formData: FormData): Promise<void> {
  await ensureSchema();
  await requireAdmin();
  const siteSlug = s(formData, "siteSlug");
  const postIdStr = s(formData, "postId");
  const ctx = await loadPage(siteSlug, postIdStr);
  if (!ctx) redirect(`/admin/sites/${siteSlug}/pages?error=page-not-found`);

  const design = buildBlobFromForm(formData);
  try {
    const resp = await callPlugin<{ ok: boolean; preview_url?: string; error?: string }>(ctx.site.id, {
      method: "POST",
      path: "/seo-apply",
      body: { kind: "page_design_preview", post_id: ctx.page.wpPostId, design },
    });
    if (resp.ok && resp.preview_url) {
      redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?preview=${encodeURIComponent(resp.preview_url)}`);
    }
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=preview-failed`);
  } catch (err) {
    const msg = err instanceof WpPluginError ? err.message : err instanceof Error ? err.message : String(err);
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=preview-failed&detail=${encodeURIComponent(msg)}`);
  }
}

/** Push the current form values to the WP plugin → persists as the saved override. */
export async function pushPageDesignAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteSlug = s(formData, "siteSlug");
  const postIdStr = s(formData, "postId");
  const ctx = await loadPage(siteSlug, postIdStr);
  if (!ctx) redirect(`/admin/sites/${siteSlug}/pages?error=page-not-found`);

  const design = buildBlobFromForm(formData);
  if (!design.vars && !design.custom_css && !design.rules) {
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=empty-design`);
  }

  try {
    const resp = await callPlugin<{ ok: boolean; error?: string; before?: unknown }>(ctx.site.id, {
      method: "POST",
      path: "/seo-apply",
      body: { kind: "page_design", post_id: ctx.page.wpPostId, design },
    });
    if (!resp.ok) {
      redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=push-failed&detail=${encodeURIComponent(resp.error ?? "")}`);
    }
    // Mark the catalogue row so the list page can show a badge.
    await db()
      .update(sitePages)
      .set({ hasDesignOverride: true, lastSyncedAt: new Date() })
      .where(eq(sitePages.id, ctx.page.id));
    await recordAdminAction({
      actor: me,
      kind: "page.design_push",
      targetType: "site",
      targetId: ctx.site.id,
      summary: `Pushed page-design override to ${ctx.site.name} post ${ctx.page.wpPostId} ("${ctx.page.title.slice(0, 60)}")`,
    });
    revalidatePath(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design`);
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?ok=pushed`);
  } catch (err) {
    const msg = err instanceof WpPluginError ? err.message : err instanceof Error ? err.message : String(err);
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=push-failed&detail=${encodeURIComponent(msg)}`);
  }
}

/** PDO-4 — Ask the agent for a CSS override from a natural-language request. */
export async function askAgentForDesignAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteSlug = s(formData, "siteSlug");
  const postIdStr = s(formData, "postId");
  const request = s(formData, "request");
  const ctx = await loadPage(siteSlug, postIdStr);
  if (!ctx) redirect(`/admin/sites/${siteSlug}/pages?error=page-not-found`);
  if (!request) {
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=empty-request`);
  }

  // Crawl the page so the agent has real HTML context.
  const crawled = await crawlPage(ctx.page.url).catch(() => null);
  const html = crawled?.rawHtml ?? `<html><body><h1>${ctx.page.title}</h1></body></html>`;

  // Load brand theme if set.
  const [theme] = await db().select().from(siteThemes).where(eq(siteThemes.siteId, ctx.site.id)).limit(1);

  const result = await proposePageDesign({
    request,
    siteName: ctx.site.name,
    siteDomain: ctx.site.domain,
    brandTheme: theme
      ? {
          primary: theme.primaryColor,
          surface: theme.surface,
          accent: theme.accent,
          fontFamilyBody: theme.fontFamilyBody,
          fontFamilyHeading: theme.fontFamilyHeading,
        }
      : undefined,
    pageHtmlExcerpt: html,
    pageTitle: ctx.page.title,
    pageUrl: ctx.page.url,
  });

  if (!result.blob) {
    redirect(
      `/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=agent-empty&detail=${encodeURIComponent(result.skipReason ?? "agent declined")}`,
    );
  }

  // Stash the proposed blob as a preview so the iframe can render it.
  try {
    const resp = await callPlugin<{ ok: boolean; preview_url?: string; error?: string }>(ctx.site.id, {
      method: "POST",
      path: "/seo-apply",
      body: { kind: "page_design_preview", post_id: ctx.page.wpPostId, design: result.blob },
    });
    if (!resp.ok || !resp.preview_url) {
      redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=preview-failed`);
    }
    await recordAdminAction({
      actor: me,
      kind: "page.design_agent_proposed",
      targetType: "site",
      targetId: ctx.site.id,
      summary: `Agent proposed design for ${ctx.site.name} post ${ctx.page.wpPostId} from request: "${request.slice(0, 80)}"`,
    });
    // Pass the proposed values back through query params so the form
    // pre-fills, AND the preview URL so the iframe shows it live.
    const params = new URLSearchParams({
      preview: resp.preview_url!,
      ok: "agent-proposed",
      rationale: result.rationale.slice(0, 200),
    });
    // Bundle the proposed vars onto the URL so the form can pre-fill.
    for (const [k, v] of Object.entries(result.blob!.vars)) {
      params.append(`pf_${k}`, v);
    }
    if (result.blob!.custom_css) {
      params.set("pf_custom_css", result.blob!.custom_css.slice(0, 4000));
    }
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?${params.toString()}`);
  } catch (err) {
    const msg = err instanceof WpPluginError ? err.message : err instanceof Error ? err.message : String(err);
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=preview-failed&detail=${encodeURIComponent(msg)}`);
  }
}

/** PDO-5 — Bulk apply the SAME design blob to multiple pages on one site. */
export async function bulkPushPageDesignAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteSlug = s(formData, "siteSlug");
  const postIds = formData.getAll("postId").filter((v): v is string => typeof v === "string");
  if (postIds.length === 0) redirect(`/admin/sites/${siteSlug}/pages?error=no-selection`);

  const [site] = await db().select().from(sites).where(eq(sites.slug, siteSlug)).limit(1);
  if (!site) redirect(`/admin/sites?error=not-found`);

  const design = buildBlobFromForm(formData);
  if (!design.vars && !design.custom_css) {
    redirect(`/admin/sites/${siteSlug}/pages?error=empty-design`);
  }

  // Resolve the WP post IDs.
  const numericIds = postIds.map((p) => Number.parseInt(p, 10)).filter((n) => Number.isFinite(n));
  const pages = await db()
    .select()
    .from(sitePages)
    .where(and(eq(sitePages.siteId, site.id), inArray(sitePages.wpPostId, numericIds)));

  let ok = 0;
  let failed = 0;
  for (const p of pages) {
    try {
      const resp = await callPlugin<{ ok: boolean; error?: string }>(site.id, {
        method: "POST",
        path: "/seo-apply",
        body: { kind: "page_design", post_id: p.wpPostId, design },
      });
      if (resp.ok) {
        await db().update(sitePages).set({ hasDesignOverride: true }).where(eq(sitePages.id, p.id));
        ok += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  await recordAdminAction({
    actor: me,
    kind: "page.design_bulk_push",
    targetType: "site",
    targetId: site.id,
    summary: `Bulk page design — ${ok} ok, ${failed} failed across ${pages.length} pages on ${site.name}`,
  });
  revalidatePath(`/admin/sites/${siteSlug}/pages`);
  redirect(`/admin/sites/${siteSlug}/pages?ok=bulk-pushed&n=${ok}&failed=${failed}`);
}

/** Clear the override entirely — sends `{ clear: true }` to the plugin. */
export async function clearPageDesignAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteSlug = s(formData, "siteSlug");
  const postIdStr = s(formData, "postId");
  const ctx = await loadPage(siteSlug, postIdStr);
  if (!ctx) redirect(`/admin/sites/${siteSlug}/pages?error=page-not-found`);

  try {
    const resp = await callPlugin<{ ok: boolean; error?: string }>(ctx.site.id, {
      method: "POST",
      path: "/seo-apply",
      body: { kind: "page_design", post_id: ctx.page.wpPostId, clear: true },
    });
    if (!resp.ok) {
      redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=clear-failed`);
    }
    await db().update(sitePages).set({ hasDesignOverride: false }).where(eq(sitePages.id, ctx.page.id));
    await recordAdminAction({
      actor: me,
      kind: "page.design_clear",
      targetType: "site",
      targetId: ctx.site.id,
      summary: `Cleared page-design override on ${ctx.site.name} post ${ctx.page.wpPostId}`,
    });
    revalidatePath(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design`);
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?ok=cleared`);
  } catch (err) {
    const msg = err instanceof WpPluginError ? err.message : err instanceof Error ? err.message : String(err);
    redirect(`/admin/sites/${siteSlug}/pages/${ctx.page.wpPostId}/design?error=clear-failed&detail=${encodeURIComponent(msg)}`);
  }
}
