"use server";

/**
 * Site Builder Studio — server actions.
 *
 * Follows the same patterns as src/app/actions/site-build.ts:
 *   await ensureSchema() · await requireAdmin() · db() · drizzle eq/and ·
 *   revalidatePath. Everything here mutates build state (layout, locked
 *   designs, keyword bank). The "Generate content" path deliberately reuses
 *   generatePageAction from site-build.ts — re-exported below — so there is
 *   exactly one page-generate code path.
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  designReferenceSections,
  designReferenceSites,
  designResearchRuns,
  designSelections,
  keywordBank,
  siteBuildPages,
  siteBuildProjects,
} from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { recordAdminAction } from "@/lib/audit-log";
import type { StudioSection } from "@/lib/page-section-specs";

// NOTE: "Generate content" reuses generatePageAction from site-build.ts directly
// (a "use server" file may only export async functions, not re-exports). The
// Studio client imports it straight from @/app/actions/site-build.

/** Normalize an incoming layout into clean, re-indexed StudioSection rows. */
function normalizeLayout(sections: StudioSection[]): StudioSection[] {
  return sections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      type: String(s.type),
      enabled: Boolean(s.enabled),
      variantSelectionId: s.variantSelectionId ?? null,
      order: i,
    }));
}

/** Persist the section layout for one page. */
export async function saveStudioLayoutAction(
  pageId: string,
  sections: StudioSection[],
): Promise<{ ok: boolean }> {
  await ensureSchema();
  const me = await requireAdmin();
  if (!pageId || !Array.isArray(sections)) return { ok: false };

  const [page] = await db().select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
  if (!page) return { ok: false };

  const layout = normalizeLayout(sections);

  await db()
    .update(siteBuildPages)
    .set({ sections: layout, updatedAt: new Date() })
    .where(eq(siteBuildPages.id, pageId));

  await recordAdminAction({
    actor: me,
    kind: "build.studio.save_layout",
    targetType: "other",
    targetId: pageId,
    summary: `Saved Studio layout (${layout.length} sections)`,
  });

  revalidatePath(`/admin/build/${page.projectId}/studio`);
  return { ok: true };
}

/**
 * Lock the representative page's design for a page type and replicate it to
 * EVERY page of that type in the project.
 */
export async function lockAndReplicateAction(
  projectId: string,
  pageType: string,
): Promise<{ ok: boolean; count: number }> {
  await ensureSchema();
  const me = await requireAdmin();
  if (!projectId || !pageType) return { ok: false, count: 0 };

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, projectId))
    .limit(1);
  if (!project) return { ok: false, count: 0 };

  const typePages = await db()
    .select()
    .from(siteBuildPages)
    .where(and(eq(siteBuildPages.projectId, projectId), eq(siteBuildPages.pageType, pageType)))
    .orderBy(siteBuildPages.sortOrder);
  if (typePages.length === 0) return { ok: false, count: 0 };

  // Representative page = the first page of this type. Use its layout as the
  // template for the whole type.
  const representative = typePages[0];
  const layout: StudioSection[] = Array.isArray(representative.sections)
    ? normalizeLayout(representative.sections as StudioSection[])
    : [];

  // Write the locked template onto the project.
  const existingLocked =
    (project.lockedDesigns && typeof project.lockedDesigns === "object"
      ? (project.lockedDesigns as Record<string, unknown>)
      : {}) ?? {};
  const nextLocked = { ...existingLocked, [pageType]: { sections: layout } };

  await db()
    .update(siteBuildProjects)
    .set({ lockedDesigns: nextLocked, updatedAt: new Date() })
    .where(eq(siteBuildProjects.id, projectId));

  // Copy the layout onto every page of this type.
  let count = 0;
  for (const p of typePages) {
    await db()
      .update(siteBuildPages)
      .set({ sections: layout, updatedAt: new Date() })
      .where(eq(siteBuildPages.id, p.id));
    count++;
  }

  await recordAdminAction({
    actor: me,
    kind: "build.studio.lock_replicate",
    targetType: "other",
    targetId: projectId,
    summary: `Locked "${pageType}" design → applied to ${count} page(s)`,
  });

  revalidatePath(`/admin/build/${projectId}/studio`);
  return { ok: true, count };
}

/** Soft-drop a keyword from the bank (status='dropped' — never hard-delete). */
export async function removeKeywordAction(keywordId: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  const me = await requireAdmin();
  if (!keywordId) return { ok: false };

  const [kw] = await db().select().from(keywordBank).where(eq(keywordBank.id, keywordId)).limit(1);
  if (!kw) return { ok: false };

  await db()
    .update(keywordBank)
    .set({ status: "dropped", updatedAt: new Date() })
    .where(eq(keywordBank.id, keywordId));

  await recordAdminAction({
    actor: me,
    kind: "build.studio.keyword_drop",
    targetType: "other",
    targetId: keywordId,
    summary: `Dropped keyword: ${kw.keyword}`,
  });

  revalidatePath(`/admin/build/${kw.projectId}/studio`);
  return { ok: true };
}

/**
 * Finalize the project's keyword bank — mark every non-dropped 'queued' row as
 * 'in_progress' (accepted/finalized). Returns how many rows were updated.
 */
export async function finalizeKeywordsAction(projectId: string): Promise<{ ok: boolean; count: number }> {
  await ensureSchema();
  const me = await requireAdmin();
  if (!projectId) return { ok: false, count: 0 };

  const rows = await db()
    .update(keywordBank)
    .set({ status: "in_progress", updatedAt: new Date() })
    .where(and(eq(keywordBank.projectId, projectId), eq(keywordBank.status, "queued")))
    .returning({ id: keywordBank.id });

  await recordAdminAction({
    actor: me,
    kind: "build.studio.keyword_finalize",
    targetType: "other",
    targetId: projectId,
    summary: `Finalized ${rows.length} keyword(s)`,
  });

  revalidatePath(`/admin/build/${projectId}/studio`);
  return { ok: true, count: rows.length };
}

/**
 * Link a design-research run's captured sections to this project so they appear
 * in the Studio as selectable variants. Inserts a design_selection per VALID
 * section (status 'selected', no build job — these are just choices the operator
 * can compose with). Idempotent: skips sections already linked to this project.
 *
 * When runId is omitted, picks the most recent run that actually has captured,
 * valid sections — so the operator can "load the latest research" in one click.
 */
export async function linkResearchToProjectAction(
  projectId: string,
  runId?: string,
): Promise<{ ok: boolean; count: number; runId: string | null }> {
  await ensureSchema();
  const me = await requireAdmin();
  if (!projectId) return { ok: false, count: 0, runId: null };

  // Resolve the run: explicit, or the newest run that has ≥1 valid section.
  let resolvedRunId = runId ?? null;
  if (!resolvedRunId) {
    const runs = await db()
      .select({ id: designResearchRuns.id })
      .from(designResearchRuns)
      .orderBy(desc(designResearchRuns.createdAt))
      .limit(20);
    for (const r of runs) {
      const siteRows = await db()
        .select({ id: designReferenceSites.id })
        .from(designReferenceSites)
        .where(eq(designReferenceSites.runId, r.id));
      if (siteRows.length === 0) continue;
      const secRows = await db()
        .select({ id: designReferenceSections.id, isValid: designReferenceSections.isValid, screenshotPath: designReferenceSections.screenshotPath })
        .from(designReferenceSections)
        .where(inArray(designReferenceSections.siteId, siteRows.map((s) => s.id)));
      // Only pick a run that has at least one USABLE section (valid + has a
      // screenshot) — don't resolve to a dead run that yields 0 links. (audit M3)
      if (secRows.some((s) => s.isValid !== false && s.screenshotPath)) {
        resolvedRunId = r.id;
        break;
      }
    }
  }
  if (!resolvedRunId) return { ok: false, count: 0, runId: null };

  // All sites + valid sections for the run.
  const sites = await db()
    .select({ id: designReferenceSites.id })
    .from(designReferenceSites)
    .where(eq(designReferenceSites.runId, resolvedRunId));
  if (sites.length === 0) return { ok: false, count: 0, runId: resolvedRunId };

  const sections = await db()
    .select()
    .from(designReferenceSections)
    .where(inArray(designReferenceSections.siteId, sites.map((s) => s.id)));

  // Already-linked section ids for this project (dedupe).
  const existing = await db()
    .select({ sectionId: designSelections.sectionId })
    .from(designSelections)
    .where(eq(designSelections.targetProjectId, projectId));
  const linked = new Set(existing.map((e) => e.sectionId));

  let count = 0;
  for (const sec of sections) {
    if (sec.isValid === false) continue;
    if (!sec.screenshotPath) continue; // only choosable if we have an image
    if (linked.has(sec.id)) continue;
    await db()
      .insert(designSelections)
      .values({
        runId: resolvedRunId,
        sectionId: sec.id,
        targetProjectId: projectId,
        status: "selected",
        createdBy: me.id,
      });
    count++;
  }

  await recordAdminAction({
    actor: me,
    kind: "build.studio.link_research",
    targetType: "other",
    targetId: projectId,
    summary: `Linked ${count} researched section(s) to the Studio`,
  });

  revalidatePath(`/admin/build/${projectId}/studio`);
  return { ok: true, count, runId: resolvedRunId };
}

/**
 * Save the composed section layout for a whole PAGE TYPE (home / service /
 * service_area / services_hub / about / reservation). Stored in
 * project.locked_designs[pageType] so it persists even before pages of that
 * type are seeded — and is the design every generated page of that type
 * inherits. Mirrors lockAndReplicateAction's storage shape.
 */
export async function saveTypeDesignAction(
  projectId: string,
  pageType: string,
  sections: StudioSection[],
): Promise<{ ok: boolean }> {
  await ensureSchema();
  const me = await requireAdmin();
  if (!projectId || !pageType || !Array.isArray(sections)) return { ok: false };

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, projectId))
    .limit(1);
  if (!project) return { ok: false };

  const layout = normalizeLayout(sections);
  const existingLocked =
    (project.lockedDesigns && typeof project.lockedDesigns === "object"
      ? (project.lockedDesigns as Record<string, unknown>)
      : {}) ?? {};
  const nextLocked = { ...existingLocked, [pageType]: { sections: layout, savedAt: new Date().toISOString() } };

  await db()
    .update(siteBuildProjects)
    .set({ lockedDesigns: nextLocked, updatedAt: new Date() })
    .where(eq(siteBuildProjects.id, projectId));

  // If pages of this type already exist, push the layout onto them too.
  await db()
    .update(siteBuildPages)
    .set({ sections: layout, updatedAt: new Date() })
    .where(and(eq(siteBuildPages.projectId, projectId), eq(siteBuildPages.pageType, pageType)));

  await recordAdminAction({
    actor: me,
    kind: "build.studio.save_type_design",
    targetType: "other",
    targetId: projectId,
    summary: `Saved composed design for "${pageType}" (${layout.length} sections)`,
  });

  revalidatePath(`/admin/build/${projectId}/studio`);
  return { ok: true };
}

/**
 * Mark a section GLOBAL (or clear it). A global section's chosen design is stored
 * once at the project level (project.globalSections[sectionType]) and applied to
 * that slot on EVERY page type — header, footer, hero, our-services, fleet,
 * areas… the local-SEO repeat-everywhere pattern. selectionId=null un-globals it.
 */
export async function setGlobalSectionAction(
  projectId: string,
  sectionType: string,
  selectionId: string | null,
): Promise<{ ok: boolean }> {
  await ensureSchema();
  const me = await requireAdmin();
  if (!projectId || !sectionType) return { ok: false };

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, projectId))
    .limit(1);
  if (!project) return { ok: false };

  const existing =
    (project.globalSections && typeof project.globalSections === "object"
      ? (project.globalSections as Record<string, { selectionId: string }>)
      : {}) ?? {};
  const next = { ...existing };
  if (selectionId) next[sectionType] = { selectionId };
  else delete next[sectionType];

  await db()
    .update(siteBuildProjects)
    .set({ globalSections: next, updatedAt: new Date() })
    .where(eq(siteBuildProjects.id, projectId));

  await recordAdminAction({
    actor: me,
    kind: "build.studio.set_global",
    targetType: "other",
    targetId: projectId,
    summary: `${selectionId ? "Set" : "Cleared"} global section: ${sectionType}`,
  });

  revalidatePath(`/admin/build/${projectId}/studio`);
  return { ok: true };
}
