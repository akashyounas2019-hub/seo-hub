"use server";

/**
 * Server actions for "Research for new design" (Phase 1 backend).
 *
 * The dashboard ONLY queues jobs — every AI/web-research/replication step runs
 * on the Mac worker via a claude_jobs row with preferWorker:"mac". The capture
 * step is a server-run Playwright job (also mac-queued, DIRECT_HANDLER). The
 * SEMrush enrichment uses the BYOK key in the postprocess. NO Anthropic API.
 *
 * Phase 2 (the UI) consumes the read helpers at the bottom.
 */

import { revalidatePath } from "next/cache";
import { asc, desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  claudeJobs,
  designReferenceSections,
  designReferenceSites,
  designResearchRuns,
  designSelections,
  siteBuildProjects,
} from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

const VALID_NICHES = [
  "cleaning", "restaurant",
  "local_service", "healthcare", "fitness", "legal",
  "home_services", "food_hospitality", "beauty", "other",
] as const;
export type DesignNiche = (typeof VALID_NICHES)[number];

export interface StartResearchInput {
  market?: string;
  niches: string[];
}

/**
 * Kick off a research run: insert the run + queue a `research:design_sites`
 * Mac job. Returns the new run id.
 */
export async function startResearchAction(input: StartResearchInput): Promise<{ runId: string }> {
  await ensureSchema();
  const me = await requireAdmin();

  const market = (input.market ?? "").trim() || "anywhere";
  const niches = (input.niches ?? []).filter((n): n is DesignNiche =>
    (VALID_NICHES as readonly string[]).includes(n),
  );
  if (niches.length === 0) {
    throw new Error("Pick at least one niche.");
  }

  const [run] = await db()
    .insert(designResearchRuns)
    .values({
      market,
      niches,
      status: "queued",
      createdBy: me.id,
    })
    .returning({ id: designResearchRuns.id });

  // Queue the research job on the Mac worker (Claude Code subscription, no API).
  await db().insert(claudeJobs).values({
    kind: "research:design_sites",
    title: `Research · Design references — ${market}`,
    input: { runId: run.id, market, niches: JSON.stringify(niches) },
    status: "pending",
    priority: "normal",
    preferWorker: "mac",
    createdBy: me.id,
  });

  // Flip queued → researching so the UI reflects the in-flight job.
  await db()
    .update(designResearchRuns)
    .set({ status: "researching" })
    .where(eq(designResearchRuns.id, run.id));

  await recordAdminAction({
    actor: me,
    kind: "design_research.start",
    targetType: "other",
    targetId: run.id,
    summary: `Started design research for ${market} (${niches.join(", ")})`,
  });

  revalidatePath("/admin/design-research");
  return { runId: run.id };
}

/**
 * Re-capture screenshots + sections for an existing run (force) — re-runs the
 * Playwright step against the sites already found, applying the latest section
 * detector. Idempotent: capture deletes + re-inserts sections per site.
 */
export async function rerunCaptureAction(runId: string): Promise<{ ok: true }> {
  await ensureSchema();
  const me = await requireAdmin();
  const [run] = await db()
    .select()
    .from(designResearchRuns)
    .where(eq(designResearchRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found.");

  await db().insert(claudeJobs).values({
    kind: "research:capture_sections",
    title: `Research · Re-capture sections — ${run.market}`,
    input: { runId, force: true },
    status: "pending",
    priority: "normal",
    preferWorker: "mac",
    createdBy: me.id,
  });
  await db()
    .update(designResearchRuns)
    .set({ status: "capturing" })
    .where(eq(designResearchRuns.id, runId));

  await recordAdminAction({
    actor: me,
    kind: "design_research.recapture",
    targetType: "other",
    targetId: runId,
    summary: `Re-captured sections for ${run.market}`,
  });
  revalidatePath(`/admin/design-research/${runId}`);
  return { ok: true };
}

/**
 * Re-run the whole research for the same market + niches as an existing run.
 * Starts a FRESH run (clean slate — no duplicate-site bookkeeping) and returns
 * its id so the client can navigate to it.
 */
export async function rerunResearchAction(runId: string): Promise<{ runId: string }> {
  await ensureSchema();
  await requireAdmin();
  const [run] = await db()
    .select()
    .from(designResearchRuns)
    .where(eq(designResearchRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found.");
  const niches = (Array.isArray(run.niches) ? run.niches : []) as DesignNiche[];
  return startResearchAction({ market: run.market, niches });
}

export interface SelectSectionInput {
  targetProjectId?: string;
  /** When true, the replication keeps the reference section's own palette. */
  useOwnPalette?: boolean;
}

/**
 * Operator picks a captured section to replicate into a build project.
 * Inserts a design_selection + queues a `research:build_section` Mac job
 * carrying the section's dom_summary + design DNA + screenshot ref.
 */
export async function selectSectionAction(
  sectionId: string,
  input: SelectSectionInput,
): Promise<{ selectionId: string }> {
  await ensureSchema();
  const me = await requireAdmin();

  const [section] = await db()
    .select()
    .from(designReferenceSections)
    .where(eq(designReferenceSections.id, sectionId))
    .limit(1);
  if (!section) throw new Error("Section not found.");

  const [site] = await db()
    .select()
    .from(designReferenceSites)
    .where(eq(designReferenceSites.id, section.siteId))
    .limit(1);
  if (!site) throw new Error("Reference site not found.");

  // Resolve target project (optional) for business name + city context.
  let targetBusiness = "the target business";
  let targetCity = "";
  let brandPalette = "";
  if (input.targetProjectId) {
    const [project] = await db()
      .select()
      .from(siteBuildProjects)
      .where(eq(siteBuildProjects.id, input.targetProjectId))
      .limit(1);
    if (project) {
      targetBusiness = project.businessName;
      targetCity = project.city ?? "";
    }
  }
  // Palette toggle: 'use-own' tells the prompt to keep the reference's palette.
  if (input.useOwnPalette) {
    brandPalette = "use-own";
  } else {
    const dna = (site.designDna ?? {}) as Record<string, unknown>;
    const palette = Array.isArray(dna.palette) ? (dna.palette as unknown[]).filter((x) => typeof x === "string") : [];
    brandPalette = palette.length > 0 ? (palette as string[]).join(", ") : "";
  }

  const replicationPrompt = `Replicate the LAYOUT of this ${section.sectionType} section (from ${site.url}) for ${targetBusiness}. Fresh copy, no original text/images.`;

  const [selection] = await db()
    .insert(designSelections)
    .values({
      runId: site.runId,
      sectionId,
      targetProjectId: input.targetProjectId ?? null,
      replicationPrompt,
      status: "selected",
      createdBy: me.id,
    })
    .returning({ id: designSelections.id });

  const screenshotRef = section.screenshotPath
    ? `/api/design-research/screenshot/${section.screenshotPath.split("/").map(encodeURIComponent).join("/")}`
    : "";

  const [job] = await db()
    .insert(claudeJobs)
    .values({
      kind: "research:build_section",
      title: `Research · Rebuild ${section.sectionType} section`,
      input: {
        selectionId: selection.id,
        sectionType: section.sectionType,
        targetBusiness,
        targetCity,
        brandPalette,
        domSummary: section.domSummary ?? "",
        designDna: site.designDna ? JSON.stringify(site.designDna) : "",
        screenshotRef,
      },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
      createdBy: me.id,
    })
    .returning({ id: claudeJobs.id });

  await db()
    .update(designSelections)
    .set({ status: "building", buildJobId: job.id })
    .where(eq(designSelections.id, selection.id));

  await recordAdminAction({
    actor: me,
    kind: "design_research.select_section",
    targetType: "other",
    targetId: selection.id,
    summary: `Queued rebuild of ${section.sectionType} section from ${site.url}`,
  });

  revalidatePath("/admin/design-research");
  return { selectionId: selection.id };
}

// ───────────────────────── Read helpers (Phase 2 UI) ─────────────────────────

export async function listResearchRuns(limit = 50) {
  await ensureSchema();
  await requireAdmin();
  return db()
    .select()
    .from(designResearchRuns)
    .orderBy(desc(designResearchRuns.createdAt))
    .limit(limit);
}

export async function getResearchRun(runId: string) {
  await ensureSchema();
  await requireAdmin();
  const [run] = await db()
    .select()
    .from(designResearchRuns)
    .where(eq(designResearchRuns.id, runId))
    .limit(1);
  if (!run) return null;

  const sites = await db()
    .select()
    .from(designReferenceSites)
    .where(eq(designReferenceSites.runId, runId))
    .orderBy(desc(designReferenceSites.semrushTraffic));

  const siteIds = sites.map((s) => s.id);
  const sections = siteIds.length
    ? await db()
        .select()
        .from(designReferenceSections)
        .orderBy(asc(designReferenceSections.order))
    : [];
  // Group sections by site (filter to this run's sites in memory — small N).
  const bySite = new Map<string, typeof sections>();
  for (const sec of sections) {
    if (!siteIds.includes(sec.siteId)) continue;
    const arr = bySite.get(sec.siteId) ?? [];
    arr.push(sec);
    bySite.set(sec.siteId, arr);
  }

  return {
    run,
    sites: sites.map((s) => ({ ...s, sections: bySite.get(s.id) ?? [] })),
  };
}

export async function listSelectionsForRun(runId: string) {
  await ensureSchema();
  await requireAdmin();
  return db()
    .select()
    .from(designSelections)
    .where(eq(designSelections.runId, runId))
    .orderBy(desc(designSelections.createdAt));
}

/** Build projects an operator can replicate a section into (for the UI picker). */
export async function listTargetProjects() {
  await ensureSchema();
  await requireAdmin();
  return db()
    .select({
      id: siteBuildProjects.id,
      businessName: siteBuildProjects.businessName,
      city: siteBuildProjects.city,
      phase: siteBuildProjects.phase,
    })
    .from(siteBuildProjects)
    .orderBy(desc(siteBuildProjects.updatedAt))
    .limit(50);
}

// ─────────────────────────────────────────────────────────────────────────
// AI section re-labeling (zero-API, Mac worker). The deterministic heuristic
// mislabels mixed/merged sections (e.g. an about/reviews block that mentions
// "our fleet" once → tagged "fleet"). This pass reads each section's heading +
// text and picks the single DOMINANT type + a human label. The run page queues
// it, polls getClassifySectionsResultAction, which applies the result + refreshes.
// ─────────────────────────────────────────────────────────────────────────

const ALLOWED_SECTION_TYPES = new Set([
  "hero", "services", "fleet", "features", "process", "areas", "faq", "stats",
  "partners", "testimonials", "pricing", "about", "contact", "cta", "gallery",
  "footer", "other",
]);

export async function queueClassifySectionsAction(
  runId: string,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    await ensureSchema();
    const me = await requireAdmin();
    const [run] = await db()
      .select()
      .from(designResearchRuns)
      .where(eq(designResearchRuns.id, runId))
      .limit(1);
    if (!run) return { ok: false, error: "run-not-found" };

    const refSites = await db()
      .select()
      .from(designReferenceSites)
      .where(eq(designReferenceSites.runId, runId));
    const siteIds = new Set(refSites.map((s) => s.id));
    if (siteIds.size === 0) return { ok: false, error: "no-sites" };
    const siteName = new Map(refSites.map((s) => [s.id, s.name]));

    const allSecs = await db()
      .select()
      .from(designReferenceSections)
      .orderBy(asc(designReferenceSections.order));
    const secs = allSecs.filter((s) => siteIds.has(s.siteId));
    if (secs.length === 0) return { ok: false, error: "no-sections" };

    const payload = secs.map((s) => ({
      id: s.id,
      site: siteName.get(s.siteId) ?? "",
      order: s.order,
      heading: s.label ?? "",
      summary: s.domSummary ?? "",
    }));

    const [job] = await db()
      .insert(claudeJobs)
      .values({
        kind: "build:classify_sections",
        title: `Classify sections — ${run.market}`.slice(0, 120),
        input: { sections: JSON.stringify(payload), runId },
        status: "pending",
        priority: "normal",
        preferWorker: "mac",
        createdBy: me.id,
      })
      .returning({ id: claudeJobs.id });
    return { ok: true, jobId: job.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function parseClassifySections(
  md: string,
): Array<{ id: string; type: string; label: string }> | null {
  const tryParse = (s: string): Array<{ id: string; type: string; label: string }> | null => {
    try {
      const o = JSON.parse(s) as { sections?: unknown };
      if (o && Array.isArray(o.sections)) {
        const arr = (o.sections as unknown[])
          .filter(
            (x): x is { id: string; type: string; label?: string } =>
              !!x &&
              typeof (x as { id?: unknown }).id === "string" &&
              typeof (x as { type?: unknown }).type === "string",
          )
          .map((x) => ({
            id: x.id,
            type: x.type.toLowerCase().trim(),
            label: typeof x.label === "string" ? x.label : "",
          }));
        return arr.length ? arr : null;
      }
    } catch {
      /* ignore */
    }
    return null;
  };
  const fence = md.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const r = tryParse(fence[1].trim());
    if (r) return r;
  }
  const obj = md.match(/\{[\s\S]*"sections"[\s\S]*\}/);
  if (obj) {
    const r = tryParse(obj[0]);
    if (r) return r;
  }
  return tryParse(md.trim());
}

export async function getClassifySectionsResultAction(
  jobId: string,
): Promise<{ ok: true; status: string; updated: number } | { ok: false; error: string }> {
  try {
    await ensureSchema();
    await requireAdmin();
    const [job] = await db().select().from(claudeJobs).where(eq(claudeJobs.id, jobId)).limit(1);
    if (!job) return { ok: false, error: "not-found" };

    let updated = 0;
    if (job.status === "done" && job.outputMarkdown) {
      const parsed = parseClassifySections(job.outputMarkdown);
      if (parsed) {
        for (const p of parsed) {
          const type = ALLOWED_SECTION_TYPES.has(p.type) ? p.type : "other";
          const label = (p.label || type).slice(0, 120);
          const res = await db()
            .update(designReferenceSections)
            .set({ sectionType: type, label })
            .where(eq(designReferenceSections.id, p.id))
            .returning({ id: designReferenceSections.id });
          if (res.length) updated += 1;
        }
        const rid = (job.input as { runId?: string } | null)?.runId;
        if (rid) revalidatePath(`/admin/design-research/${rid}`);
      }
    }
    return { ok: true, status: job.status, updated };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
