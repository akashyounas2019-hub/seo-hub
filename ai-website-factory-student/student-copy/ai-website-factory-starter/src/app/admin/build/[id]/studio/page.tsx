/**
 * /admin/build/[id]/studio — the Site Builder Studio (drag-and-drop composer).
 *
 * Server shell: loads the project, the canonical page-type set, the keyword
 * bank, the researched section VARIANTS (captured screenshots grouped by
 * section type, with their source-site label + a public image URL), and any
 * saved per-type compositions (project.lockedDesigns). Hands a fully
 * serializable payload to <StudioClient/>, which is the interactive composer.
 */
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
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
import { PageHeader } from "@/components/ui/PageHeader";
import {
  PAGE_TYPE_LABELS,
  defaultSectionsForPageType,
  resolveSections,
  type StudioSection,
} from "@/lib/page-section-specs";
import {
  linkResearchToProjectAction,
  saveTypeDesignAction,
  lockAndReplicateAction,
  finalizeKeywordsAction,
  removeKeywordAction,
  setGlobalSectionAction,
} from "@/app/actions/studio";
import { StudioClient } from "./StudioClient";
import type { StudioKeyword, StudioVariant } from "./StudioClient";

export const dynamic = "force-dynamic";

/** The page types the composer always exposes, in tab order. */
const COMPOSER_TYPES = ["home", "service_area", "service", "services_hub", "about", "reservation"] as const;

/** Build the public image URL for a stored screenshot path. */
function screenshotUrl(path: string | null): string | null {
  if (!path) return null;
  return `/api/design-research/screenshot/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export default async function StudioPage({ params }: { params: { id: string } }) {
  await ensureSchema();
  const me = await requireAdmin();

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, params.id))
    .limit(1);
  if (!project) notFound();

  // Keyword bank — exclude dropped.
  const keywordRows = await db()
    .select()
    .from(keywordBank)
    .where(and(eq(keywordBank.projectId, project.id), ne(keywordBank.status, "dropped")))
    .orderBy(keywordBank.createdAt);

  // Researched section variants linked to this project, with source-site label.
  const loadSelections = () =>
    db()
      .select({
        selectionId: designSelections.id,
        status: designSelections.status,
        sectionType: designReferenceSections.sectionType,
        label: designReferenceSections.label,
        screenshotPath: designReferenceSections.screenshotPath,
        siteName: designReferenceSites.name,
        siteUrl: designReferenceSites.url,
        siteTraffic: designReferenceSites.semrushTraffic,
      })
      .from(designSelections)
      .innerJoin(designReferenceSections, eq(designSelections.sectionId, designReferenceSections.id))
      .innerJoin(designReferenceSites, eq(designReferenceSections.siteId, designReferenceSites.id))
      .where(eq(designSelections.targetProjectId, project.id));

  let selectionRows = await loadSelections();

  // AUTO-LOAD: if no sections are linked yet, pull in the most recent research
  // run that actually has captured, valid sections — so the composer is never
  // empty when research exists. Idempotent (skips already-linked sections);
  // no revalidate (we re-query in-render).
  if (selectionRows.length === 0) {
    const runs = await db()
      .select({ id: designResearchRuns.id })
      .from(designResearchRuns)
      .orderBy(desc(designResearchRuns.createdAt))
      .limit(25);
    for (const r of runs) {
      const sites = await db()
        .select({ id: designReferenceSites.id })
        .from(designReferenceSites)
        .where(eq(designReferenceSites.runId, r.id));
      if (sites.length === 0) continue;
      const secs = await db()
        .select()
        .from(designReferenceSections)
        .where(inArray(designReferenceSections.siteId, sites.map((s) => s.id)));
      const usable = secs.filter((s) => s.isValid !== false && s.screenshotPath);
      if (usable.length === 0) continue;
      for (const sec of usable) {
        await db().insert(designSelections).values({
          runId: r.id,
          sectionId: sec.id,
          targetProjectId: project.id,
          status: "selected",
          createdBy: me.id,
        });
      }
      break; // linked the newest run with usable sections
    }
    selectionRows = await loadSelections();
  }

  const variantsByType: Record<string, StudioVariant[]> = {};
  for (const row of selectionRows) {
    const type = row.sectionType || "other";
    (variantsByType[type] ||= []).push({
      selectionId: row.selectionId,
      sectionType: type,
      label: row.label ?? null,
      screenshotUrl: screenshotUrl(row.screenshotPath),
      siteName: row.siteName ?? null,
      siteUrl: row.siteUrl ?? null,
      siteTraffic: row.siteTraffic ?? null,
      recommended: false,
    });
  }
  // CURATION: within each section type, rank by source-site authority (SEMrush
  // traffic, highest first; unknowns last) and flag the top one ★ Recommended so
  // the operator picks a curated winner instead of guessing.
  for (const type of Object.keys(variantsByType)) {
    variantsByType[type].sort((a, b) => (b.siteTraffic ?? -1) - (a.siteTraffic ?? -1));
    if (variantsByType[type][0]) variantsByType[type][0].recommended = true;
  }
  const variantCount = selectionRows.length;

  // Saved per-type compositions (project.lockedDesigns keyed by pageType) — used
  // to preload the composer. Falls back to the canonical default per type.
  const locked = (project.lockedDesigns && typeof project.lockedDesigns === "object"
    ? (project.lockedDesigns as Record<string, { sections?: StudioSection[] }>)
    : {}) ?? {};
  const savedByType: Record<string, StudioSection[]> = {};
  for (const t of COMPOSER_TYPES) {
    const saved = locked[t]?.sections;
    savedByType[t] = resolveSections(t, Array.isArray(saved) ? saved : null);
  }

  const keywords: StudioKeyword[] = keywordRows.map((k) => ({
    id: k.id,
    keyword: k.keyword,
    status: k.status,
    role: k.role,
    intent: k.intent ?? null,
    volumeTier: k.volumeTier ?? null,
  }));

  const pageTypeTabs = COMPOSER_TYPES.map((t) => ({ type: t, label: PAGE_TYPE_LABELS[t] ?? t }));

  // Global sections — designs chosen once and applied to that slot on every page.
  const globalSections = (project.globalSections && typeof project.globalSections === "object"
    ? (project.globalSections as Record<string, { selectionId: string }>)
    : {}) ?? {};

  return (
    <div className="space-y-5">
      <PageHeader
        backHref={`/admin/build/${project.id}/cockpit`}
        backLabel="Live cockpit"
        title="Site Builder Studio"
        subtitle={`Compose each page type for ${project.businessName} from real researched sections. Pick a page type, drag sections into order, choose a design variant for each from top cleaning-services sites, and watch the page build on the right.`}
      />

      <StudioClient
        projectId={project.id}
        businessName={project.businessName}
        pageTypes={pageTypeTabs}
        savedByType={savedByType}
        keywords={keywords}
        variantsByType={variantsByType}
        variantCount={variantCount}
        globalSections={globalSections}
        actions={{
          saveType: saveTypeDesignAction,
          linkResearch: linkResearchToProjectAction,
          lockReplicate: lockAndReplicateAction,
          finalizeKeywords: finalizeKeywordsAction,
          removeKeyword: removeKeywordAction,
          setGlobal: setGlobalSectionAction,
        }}
      />
    </div>
  );
}
