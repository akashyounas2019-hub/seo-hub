"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, contentBriefs, siteBuildProjects, sites, type ContentBrief } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import { recordAdminAction } from "@/lib/audit-log";
import {
  proposeBrief,
  isPageType,
  type PageType,
  type ContentBriefPlan,
} from "@/lib/content-brief-engine";

export interface ProposeBriefActionInput {
  siteId: string;
  pageType: PageType;
  targetKeyword: string;
  cluster?: string[];
}

export type ProposeBriefActionResult =
  | { ok: true; brief: ContentBrief; plan: ContentBriefPlan }
  | { ok: false; error: string };

/**
 * Run the brief engine for a {site, pageType, targetKeyword}, persist the
 * structured plan as a content_briefs row with status='proposed', return it.
 *
 * Grounded: the engine pulls real site facts + SEMrush keywords and emits
 * `needs business fact: X` markers rather than inventing local detail.
 */
export async function proposeBriefAction(
  input: ProposeBriefActionInput,
): Promise<ProposeBriefActionResult> {
  await ensureSchema();
  const me = await requireAdmin();

  const siteId = input.siteId?.trim();
  const targetKeyword = input.targetKeyword?.trim();
  if (!siteId) return { ok: false, error: "missing-site" };
  if (!targetKeyword) return { ok: false, error: "missing-keyword" };
  if (!isPageType(input.pageType)) return { ok: false, error: "invalid-page-type" };

  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return { ok: false, error: "site-not-found" };

  let plan: ContentBriefPlan;
  try {
    plan = await proposeBrief({
      siteId,
      pageType: input.pageType,
      targetKeyword,
      cluster: input.cluster,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 240) };
  }

  const title = plan.headlineOptions[0] ?? targetKeyword;
  // home/about/contact/pricing/faq are pages; service/area/blog vary, but a
  // brief from this engine is always a standalone page in WP terms.
  const contentType = plan.pageType === "blog" ? "post" : "page";

  const [inserted] = await db()
    .insert(contentBriefs)
    .values({
      siteId,
      title,
      targetKeyword,
      contentType,
      status: "proposed",
      createdBy: me.id,
      pageType: plan.pageType,
      intent: plan.intent,
      vertical: plan.vertical,
      wordCountTarget: plan.wordCountTarget,
      headlineOptions: plan.headlineOptions,
      metaTitleOptions: plan.metaTitleOptions,
      outline: plan.outline,
      schemaPlan: plan.schemaPlan,
      aiOverviewBlock: plan.aiOverviewAnswerBlock,
      geoEntities: plan.geoEntities,
      internalLinkTargets: plan.internalLinkTargets,
      aiOverviewScore: plan.aiOverviewScore,
      pillarChecklist: plan.pillarChecklist,
      keywordHarvest: {
        ...plan.keywords,
        readinessReasons: plan.aiOverviewReadiness.reasons,
      },
      needsBusinessFacts: plan.needsBusinessFacts,
      transitions: [{ from: "(new)", to: "proposed", at: new Date().toISOString(), by: me.id }],
    })
    .returning();

  await recordAdminAction({
    actor: me,
    kind: "content.brief_propose",
    targetType: "site",
    targetId: siteId,
    summary: `Proposed ${plan.pageType} brief "${title}" — AIO readiness ${plan.aiOverviewScore}/100${plan.needsBusinessFacts.length ? ` · ${plan.needsBusinessFacts.length} fact gap(s)` : ""}`,
    after: { pageType: plan.pageType, aiOverviewScore: plan.aiOverviewScore, keyword: targetKeyword },
  });

  revalidatePath("/admin/content");
  return { ok: true, brief: inserted, plan };
}

export interface BriefEdits {
  title?: string;
  headlineOptions?: string[];
  metaTitleOptions?: string[];
  aiOverviewBlock?: string;
  outline?: ContentBriefPlan["outline"];
  internalLinkTargets?: string[];
}

export type ApproveBriefActionResult =
  | { ok: true; brief: ContentBrief }
  | { ok: false; error: string };

/**
 * Approve a proposed brief (optionally applying operator edits first), moving
 * it to status='approved' so a Phase-2 generate-from-brief job can pick it up.
 */
export async function approveBriefAction(
  briefId: string,
  edits?: BriefEdits,
): Promise<ApproveBriefActionResult> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = briefId?.trim();
  if (!id) return { ok: false, error: "missing-id" };

  const [brief] = await db().select().from(contentBriefs).where(eq(contentBriefs.id, id)).limit(1);
  if (!brief) return { ok: false, error: "brief-not-found" };

  const update: Partial<typeof contentBriefs.$inferInsert> = {
    status: "approved",
    updatedAt: new Date(),
  };
  if (edits?.title?.trim()) update.title = edits.title.trim();
  if (edits?.headlineOptions) update.headlineOptions = edits.headlineOptions;
  if (edits?.metaTitleOptions) update.metaTitleOptions = edits.metaTitleOptions;
  if (typeof edits?.aiOverviewBlock === "string") update.aiOverviewBlock = edits.aiOverviewBlock;
  if (edits?.outline) update.outline = edits.outline;
  if (edits?.internalLinkTargets) update.internalLinkTargets = edits.internalLinkTargets;

  const log = (brief.transitions as Array<Record<string, unknown>>) ?? [];
  log.push({ from: brief.status, to: "approved", at: new Date().toISOString(), by: me.id });
  update.transitions = log as Array<{ from: string; to: string; at: string; by: string | null; note?: string }>;

  const [updated] = await db().update(contentBriefs).set(update).where(eq(contentBriefs.id, id)).returning();

  await recordAdminAction({
    actor: me,
    kind: "content.brief_approve",
    targetType: "other",
    targetId: id,
    summary: `Approved brief "${updated.title}"${edits ? " (with edits)" : ""}`,
    before: { status: brief.status },
    after: { status: "approved" },
  });

  revalidatePath("/admin/content");
  revalidatePath(`/admin/content/${id}`);
  return { ok: true, brief: updated };
}

// ============================================================
// Phase 2 — generate-from-brief
// ============================================================

export type GenerateFromBriefActionResult =
  | { ok: true; briefId: string; jobId: string }
  | { ok: false; error: string };

/**
 * Take an APPROVED brief, flip it to `generating`, and dispatch a
 * `build:page_generate` job whose prompt is built FROM the brief (outline,
 * word-count band, chosen headline/meta title, schema plan, AI-Overview
 * answer block, geo entities, internal-link targets, vertical, and the
 * "needs business fact" gaps).
 *
 * Routed `preferWorker: "mac"` — page generation runs on the Claude Code
 * subscription, not the API (per the worker-routing rules). On completion,
 * build-job-postprocess lands the draft back in the content pipeline
 * (content_briefs.draftMarkdown, status → `review`) where the existing
 * critic/quality gate still governs publish. This NEVER bypasses the gauntlet.
 */
export async function generateFromBriefAction(
  briefId: string,
): Promise<GenerateFromBriefActionResult> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = briefId?.trim();
  if (!id) return { ok: false, error: "missing-id" };

  const [brief] = await db().select().from(contentBriefs).where(eq(contentBriefs.id, id)).limit(1);
  if (!brief) return { ok: false, error: "brief-not-found" };
  if (brief.status !== "approved") return { ok: false, error: "brief-not-approved" };

  const [site] = await db().select().from(sites).where(eq(sites.id, brief.siteId)).limit(1);
  if (!site) return { ok: false, error: "site-not-found" };

  // Pull the linked build project (if any) for Design DNA voice + business
  // facts. Best-effort: the page-generate template degrades gracefully when
  // these are absent.
  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.publishedSiteId, brief.siteId))
    .limit(1);

  const designDna =
    (project?.designDna && typeof project.designDna === "object" && "markdown" in project.designDna
      ? String((project.designDna as Record<string, unknown>).markdown ?? "")
      : "") ||
    "No Design DNA on file — write in a clean, professional, specific local-business voice. No empty superlatives.";

  // Editor's chosen headline + meta title are the first option (the wizard
  // re-orders the array so the pick is at index 0 before approve).
  const chosenHeadline = brief.headlineOptions?.[0] ?? brief.title;
  const chosenMetaTitle = brief.metaTitleOptions?.[0] ?? null;

  // Serialize the approved plan for the prompt builder (buildBriefBlock).
  const briefPayload = {
    pageType: brief.pageType,
    targetKeyword: brief.targetKeyword,
    intent: brief.intent,
    vertical: brief.vertical,
    wordCountTarget: brief.wordCountTarget ?? undefined,
    chosenHeadline,
    chosenMetaTitle,
    headlineOptions: brief.headlineOptions,
    metaTitleOptions: brief.metaTitleOptions,
    outline: brief.outline,
    schemaPlan: brief.schemaPlan ?? undefined,
    aiOverviewBlock: brief.aiOverviewBlock ?? undefined,
    geoEntities: brief.geoEntities,
    internalLinkTargets: brief.internalLinkTargets,
    needsBusinessFacts: brief.needsBusinessFacts,
  };

  // The page-generate template's per-type emphasis uses 'service_area' where
  // the engine uses 'area'. Map so the right section emphasis fires.
  const tmplPageType = brief.pageType === "area" ? "service_area" : (brief.pageType ?? "service");

  const input: Record<string, unknown> = {
    briefId: id,
    briefPayload: JSON.stringify(briefPayload),
    businessName: site.name,
    targetCity: site.city ?? project?.city ?? "",
    pageType: tmplPageType,
    pageTitle: chosenHeadline,
    targetKeyword: brief.targetKeyword ?? brief.title,
    aiOverviewAngle: brief.aiOverviewBlock ?? "",
    designDna,
    businessFacts: project?.businessFacts ? JSON.stringify(project.businessFacts) : "",
  };

  const [job] = await db()
    .insert(claudeJobs)
    .values({
      kind: "build:page_generate",
      title: `Generate page from brief — ${chosenHeadline}`,
      siteId: brief.siteId,
      input,
      status: "pending",
      priority: "normal",
      preferWorker: "mac", // Claude Code subscription — no API spend.
      createdBy: me.id,
    })
    .returning({ id: claudeJobs.id });

  // Flip the brief to 'generating' + log the transition.
  const log = (brief.transitions as Array<Record<string, unknown>>) ?? [];
  log.push({ from: brief.status, to: "generating", at: new Date().toISOString(), by: me.id, note: `dispatched job ${job.id}` });
  await db()
    .update(contentBriefs)
    .set({
      status: "generating",
      transitions: log as Array<{ from: string; to: string; at: string; by: string | null; note?: string }>,
      updatedAt: new Date(),
    })
    .where(eq(contentBriefs.id, id));

  await recordAdminAction({
    actor: me,
    kind: "content.brief_generate",
    targetType: "other",
    targetId: id,
    summary: `Dispatched generate-from-brief job for "${chosenHeadline}" (job ${job.id}, Mac worker)`,
    after: { jobId: job.id, pageType: brief.pageType },
  });

  revalidatePath("/admin/content");
  revalidatePath(`/admin/content/${id}`);
  return { ok: true, briefId: id, jobId: job.id };
}

export type ProposeAndGenerateActionResult =
  | { ok: true; briefId: string; jobId: string; plan: ContentBriefPlan }
  | { ok: false; error: string };

/**
 * Fast-path "one-click": propose → auto-approve → generate in a single call.
 * Brief-approval remains the DEFAULT flow (propose → review → approve →
 * generate); this is the explicit fast button the operator opted into.
 *
 * It reuses proposeBriefAction + approveBriefAction + generateFromBriefAction
 * verbatim, so the same grounding, gating, and worker-routing apply — the
 * only difference is there's no manual review pause before generation. The
 * draft still lands in `review` and must clear the quality gate before publish.
 */
export async function proposeAndGenerateAction(
  input: ProposeBriefActionInput,
): Promise<ProposeAndGenerateActionResult> {
  const proposed = await proposeBriefAction(input);
  if (!proposed.ok) return { ok: false, error: proposed.error };

  const approved = await approveBriefAction(proposed.brief.id);
  if (!approved.ok) return { ok: false, error: approved.error };

  const generated = await generateFromBriefAction(proposed.brief.id);
  if (!generated.ok) return { ok: false, error: generated.error };

  return { ok: true, briefId: proposed.brief.id, jobId: generated.jobId, plan: proposed.plan };
}

// ─────────────────────────────────────────────────────────────────────────
// AI headline sharpener — rewrites a brief's section H2s into stronger
// modern local-SEO headlines using the page's harvested keywords. Runs as a
// `build:sharpen_headlines` Mac-worker job (Claude Code subscription, no API).
// The wizard queues it, polls getSharpenResultAction, and applies the result.
// ─────────────────────────────────────────────────────────────────────────

export interface SharpenHeadlinesInput {
  pageType: PageType;
  targetKeyword: string;
  headlines: string[];
  keywords?: Record<string, string[]>;
  city?: string;
}

export async function queueSharpenHeadlinesAction(
  input: SharpenHeadlinesInput,
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  try {
    await ensureSchema();
    const me = await requireAdmin();
    const heads = (input.headlines || []).filter((h) => typeof h === "string" && h.trim());
    if (heads.length === 0) return { ok: false, error: "no-headlines" };
    const [job] = await db()
      .insert(claudeJobs)
      .values({
        kind: "build:sharpen_headlines",
        title: `Sharpen headlines — ${input.targetKeyword}`.slice(0, 120),
        input: {
          pageType: input.pageType,
          targetKeyword: input.targetKeyword,
          city: input.city ?? "",
          headlines: JSON.stringify(heads),
          keywords: JSON.stringify(input.keywords ?? {}),
        },
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

function parseSharpenHeadlines(md: string): string[] | null {
  const tryParse = (s: string): string[] | null => {
    try {
      const o = JSON.parse(s) as { headlines?: unknown };
      if (o && Array.isArray(o.headlines)) {
        const arr = o.headlines.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
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
  const obj = md.match(/\{[\s\S]*"headlines"[\s\S]*\}/);
  if (obj) {
    const r = tryParse(obj[0]);
    if (r) return r;
  }
  return tryParse(md.trim());
}

export async function getSharpenResultAction(
  jobId: string,
): Promise<{ ok: true; status: string; headlines: string[] | null; error?: string } | { ok: false; error: string }> {
  try {
    await ensureSchema();
    await requireAdmin();
    const [job] = await db().select().from(claudeJobs).where(eq(claudeJobs.id, jobId)).limit(1);
    if (!job) return { ok: false, error: "not-found" };
    let headlines: string[] | null = null;
    if (job.status === "done" && job.outputMarkdown) headlines = parseSharpenHeadlines(job.outputMarkdown);
    return { ok: true, status: job.status, headlines, error: job.error ?? undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
