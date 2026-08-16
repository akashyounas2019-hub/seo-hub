/**
 * Post-process a completed claude_job for the build workspace.
 *
 * Called from BOTH paths that complete a job:
 *  - server-side executor (src/lib/claude-server-executor.ts)
 *  - Mac worker (POST /api/claude-jobs/<id>/complete)
 *
 * Detects build:* job kinds and routes the output to the right place:
 *  - build:global_research → site_build_projects.research
 *  - build:design_dna      → site_build_projects.design_dna
 *  - build:sitemap_plan    → site_build_projects.sitemap + seed pages
 *  - build:page_generate   → site_build_pages.{body,schema,scores,status='ready'}
 *  - build:quality_review  → site_build_projects.quality_report
 *
 * Safe to call multiple times — each branch is idempotent.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  claudeJobs,
  contentBriefs,
  designReferenceSites,
  designResearchRuns,
  designSelections,
  siteBuildPages,
  siteBuildProjects,
} from "../db/schema";
import { extractPageFromOutput, scorePage } from "./build-page-extractor";
import { parseSitemapMarkdown } from "./build-sitemap-parser";

/** Extract the first JSON value (array or object) out of an LLM markdown reply. */
function extractJson<T>(markdown: string): T | null {
  if (!markdown) return null;
  // Prefer a fenced ```json block.
  const fence = markdown.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates: string[] = [];
  if (fence) candidates.push(fence[1].trim());
  // Fall back to the first balanced [...] or {...} run.
  const arr = markdown.match(/\[[\s\S]*\]/);
  if (arr) candidates.push(arr[0]);
  const obj = markdown.match(/\{[\s\S]*\}/);
  if (obj) candidates.push(obj[0]);
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      // try next
    }
  }
  return null;
}

// Niche is free-text now (the operator types their industry). Accept any
// reasonable label and just normalize whitespace/length.
function normalizeNiche(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().slice(0, 80);
  return v.length > 0 ? v : null;
}

/** Shape of the content_briefs.transitions append-only log. */
type ContentBriefTransitions = Array<{ from: string; to: string; at: string; by: string | null; note?: string }>;

export async function postProcessJob(jobId: string): Promise<void> {
  const [job] = await db().select().from(claudeJobs).where(eq(claudeJobs.id, jobId)).limit(1);
  if (!job || job.status !== "done" || !job.outputMarkdown) return;

  const input = (job.input ?? {}) as Record<string, unknown>;
  const projectId = typeof input.projectId === "string" ? input.projectId : null;

  // ── build:global_research ────────────────────────────────────
  if (job.kind === "build:global_research" && projectId) {
    await db()
      .update(siteBuildProjects)
      .set({
        research: { markdown: job.outputMarkdown, completedAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(siteBuildProjects.id, projectId));
    return;
  }

  // ── build:design_dna ─────────────────────────────────────────
  if (job.kind === "build:design_dna" && projectId) {
    await db()
      .update(siteBuildProjects)
      .set({
        designDna: { markdown: job.outputMarkdown, completedAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(siteBuildProjects.id, projectId));
    return;
  }

  // ── build:sitemap_plan ───────────────────────────────────────
  if (job.kind === "build:sitemap_plan" && projectId) {
    const parsed = parseSitemapMarkdown(job.outputMarkdown);
    await db()
      .update(siteBuildProjects)
      .set({
        sitemap: {
          markdown: job.outputMarkdown,
          parsedCount: parsed.length,
          completedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(siteBuildProjects.id, projectId));

    // Seed pages — idempotent (page_slug is unique per project).
    for (const p of parsed) {
      await db()
        .insert(siteBuildPages)
        .values({
          projectId,
          pageSlug: p.pageSlug,
          pageType: p.pageType,
          title: p.title,
          h1: p.h1,
          status: "pending",
          sortOrder: p.sortOrder,
        })
        .onConflictDoNothing();
    }
    return;
  }

  // ── build:page_generate (from an approved content brief) ─────
  // Phase 2 generate-from-brief: the job carries a briefId (content_briefs
  // row) instead of a build pageId. The generated draft lands back in the
  // CONTENT pipeline — content_briefs.draftMarkdown — and the brief moves to
  // status='review' so the existing critic→approve→publish gauntlet still
  // gates it. We never publish straight from here.
  if (job.kind === "build:page_generate" && typeof input.briefId === "string" && !input.pageId) {
    const briefId = input.briefId;
    const [brief] = await db().select().from(contentBriefs).where(eq(contentBriefs.id, briefId)).limit(1);
    if (!brief) return;
    // Only act on a brief we put into 'generating'. Guards against a stale or
    // re-run job clobbering a brief the operator already moved on.
    if (brief.status !== "generating") return;

    const extracted = extractPageFromOutput(job.outputMarkdown);
    const log = (brief.transitions as Array<Record<string, unknown>>) ?? [];

    if (!extracted) {
      // Couldn't parse — bounce back to 'approved' with the raw output saved as
      // review notes so the operator can re-run or hand-fix. Never silently lose it.
      log.push({ from: "generating", to: "approved", at: new Date().toISOString(), by: brief.createdBy ?? null, note: "generation output unparseable — re-run or draft by hand" });
      await db()
        .update(contentBriefs)
        .set({
          status: "approved",
          reviewNotes: `[generate-from-brief] could not parse the generated page JSON. Raw output:\n\n${job.outputMarkdown.slice(0, 8000)}`,
          transitions: log as ContentBriefTransitions,
          updatedAt: new Date(),
        })
        .where(eq(contentBriefs.id, briefId));
      return;
    }

    // Land the draft in the content pipeline. Markdown is the section-block
    // body the renderer/extractor understands; keep meta + schema alongside.
    const draftParts: string[] = [];
    if (extracted.h1) draftParts.push(`# ${extracted.h1}`);
    draftParts.push(extracted.bodyMarkdown);
    if (extracted.schemaJson) {
      draftParts.push(`\n<!-- schema_json (validated by the publish gauntlet before publish):\n${JSON.stringify(extracted.schemaJson, null, 2)}\n-->`);
    }
    const draftMarkdown = draftParts.filter(Boolean).join("\n\n");

    log.push({ from: "generating", to: "review", at: new Date().toISOString(), by: brief.createdBy ?? null, note: "draft generated from approved brief — awaiting quality gate" });
    await db()
      .update(contentBriefs)
      .set({
        status: "review",
        draftMarkdown,
        title: extracted.h1 || brief.title,
        metaTitleOptions: extracted.metaTitle ? [extracted.metaTitle, ...(brief.metaTitleOptions ?? [])].slice(0, 4) : brief.metaTitleOptions,
        transitions: log as ContentBriefTransitions,
        updatedAt: new Date(),
      })
      .where(eq(contentBriefs.id, briefId));
    return;
  }

  // ── build:page_generate ──────────────────────────────────────
  if (job.kind === "build:page_generate") {
    const pageId = typeof input.pageId === "string" ? input.pageId : null;
    if (!pageId) return;
    const extracted = extractPageFromOutput(job.outputMarkdown);
    if (!extracted) {
      // Couldn't parse — surface a failure status with the raw output preserved.
      await db()
        .update(siteBuildPages)
        .set({
          status: "failed",
          bodyMarkdown: job.outputMarkdown.slice(0, 8000),
          updatedAt: new Date(),
        })
        .where(eq(siteBuildPages.id, pageId));
      return;
    }
    const scores = scorePage(extracted);
    await db()
      .update(siteBuildPages)
      .set({
        title: extracted.h1 || undefined,
        h1: extracted.h1,
        metaTitle: extracted.metaTitle,
        metaDescription: extracted.metaDescription,
        bodyMarkdown: extracted.bodyMarkdown,
        bodyHtml: extracted.bodyHtml,
        schemaJson: extracted.schemaJson,
        aiOverviewScore: scores.aiOverviewScore,
        seoScore: scores.seoScore,
        status: "ready",
        jobId: job.id,
        updatedAt: new Date(),
      })
      .where(eq(siteBuildPages.id, pageId));

    return;
  }

  // ── build:quality_review ─────────────────────────────────────
  if (job.kind === "build:quality_review" && projectId) {
    await db()
      .update(siteBuildProjects)
      .set({
        qualityReport: { markdown: job.outputMarkdown, completedAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(siteBuildProjects.id, projectId));
    return;
  }

  // ── research:design_sites ────────────────────────────────────
  // The LLM returned a JSON array of high-performing reference sites. Insert
  // one design_reference_sites row per entry, enrich each with a best-effort
  // SEMrush domain pull, flip the run to 'capturing', and queue the
  // (Playwright) capture job. ZERO Anthropic API in this path.
  if (job.kind === "research:design_sites" && typeof input.runId === "string") {
    const runId = input.runId;
    const [run] = await db().select().from(designResearchRuns).where(eq(designResearchRuns.id, runId)).limit(1);
    if (!run) return;
    // Guard against re-runs clobbering a run that already moved on.
    if (run.status !== "researching" && run.status !== "queued") return;

    type RefSite = {
      url?: string; name?: string; market?: string; niche?: string;
      whyHighPerforming?: string; designNotes?: string;
      designDna?: Record<string, unknown>; keySections?: unknown;
    };
    const sites = extractJson<RefSite[]>(job.outputMarkdown);
    if (!Array.isArray(sites) || sites.length === 0) {
      await db()
        .update(designResearchRuns)
        .set({ status: "failed", summary: "Research output had no parseable site list." })
        .where(eq(designResearchRuns.id, runId));
      return;
    }

    // Best-effort SEMrush enrichment per site. Import lazily so a missing key
    // / network failure never blocks the insert.
    let domainOverview: ((domain: string) => Promise<{ rank: number | null; organicTraffic: number | null }>) | null = null;
    try {
      const mod = await import("./semrush");
      domainOverview = (d: string) => mod.domainOverview(d);
    } catch {
      domainOverview = null;
    }

    let inserted = 0;
    for (const s of sites) {
      if (!s || typeof s.url !== "string" || !s.url.trim()) continue;
      const url = s.url.trim();
      const niche = normalizeNiche(s.niche);

      let semrushRank: number | null = null;
      let semrushTraffic: number | null = null;
      if (domainOverview) {
        try {
          const ov = await domainOverview(url);
          semrushRank = ov.rank;
          semrushTraffic = ov.organicTraffic;
        } catch {
          // best-effort — leave null
        }
      }

      await db().insert(designReferenceSites).values({
        runId,
        url,
        name: typeof s.name === "string" && s.name.trim() ? s.name.trim() : url,
        market: typeof s.market === "string" ? s.market : run.market,
        niche,
        whyHighPerforming: typeof s.whyHighPerforming === "string" ? s.whyHighPerforming : null,
        designNotes: typeof s.designNotes === "string" ? s.designNotes : null,
        designDna: s.designDna && typeof s.designDna === "object" ? (s.designDna as Record<string, unknown>) : null,
        semrushRank,
        semrushTraffic,
        status: "researching",
      });
      inserted += 1;
    }

    await db()
      .update(designResearchRuns)
      .set({ status: "capturing", summary: `${inserted} reference site(s) found — capturing sections.` })
      .where(eq(designResearchRuns.id, runId));

    // Queue the Playwright capture job on the Mac worker. The worker runs it
    // via DIRECT_HANDLERS (server step), not the claude CLI.
    await db().insert(claudeJobs).values({
      kind: "research:capture_sections",
      title: "Research · Capture reference sections",
      input: { runId },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
      createdBy: job.createdBy ?? null,
    });
    return;
  }

  // ── research:build_section ───────────────────────────────────
  // The LLM rebuilt one section's layout as HTML + scoped CSS. Persist it
  // into the target build project as a page row + flip the selection to 'built'.
  if (job.kind === "research:build_section" && typeof input.selectionId === "string") {
    const selectionId = input.selectionId;
    const [selection] = await db().select().from(designSelections).where(eq(designSelections.id, selectionId)).limit(1);
    if (!selection) return;
    if (selection.status === "built") return; // idempotent

    type Built = { section_type?: string; html?: string; css?: string; copy_notes?: string };
    const built = extractJson<Built>(job.outputMarkdown);
    const sectionType = built?.section_type || (typeof input.sectionType === "string" ? input.sectionType : "section");
    const html = built?.html ?? "";
    const css = built?.css ?? "";
    const bodyHtml = `${css}\n${html}`.trim();

    // Write into the target build project (if one was chosen) as a page/section
    // row. We model a replicated section as a site_build_page with a synthetic
    // slug so it surfaces in the Build workspace alongside generated pages.
    if (selection.targetProjectId && bodyHtml) {
      const slug = `section-${sectionType}-${selectionId.slice(0, 8)}`;
      await db()
        .insert(siteBuildPages)
        .values({
          projectId: selection.targetProjectId,
          pageSlug: slug,
          pageType: "section",
          title: `Replicated ${sectionType} section`,
          h1: null,
          bodyMarkdown: built?.copy_notes ?? null,
          bodyHtml,
          status: "ready",
          jobId: job.id,
        })
        .onConflictDoNothing();
    }

    await db()
      .update(designSelections)
      .set({ status: "built" })
      .where(eq(designSelections.id, selectionId));
    return;
  }
}
