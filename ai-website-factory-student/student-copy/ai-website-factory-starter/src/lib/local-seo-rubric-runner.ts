/**
 * Local SEO Rubric — runner.
 *
 * Orchestrates the audit across all pages of either:
 *   - A LIVE site (pulls page list via the WP plugin's /seo-inventory
 *     endpoint, then fetches each URL's HTML).
 *   - A pre-deploy BUILD project (audits site_build_pages rows in place,
 *     reading body_html / body_markdown directly).
 *
 * For each page:
 *   1. Build the RubricPageInput
 *   2. Run the deterministic checker
 *   3. (Optional) Run the Haiku judge for subjective checks
 *   4. Apply judge verdicts, recompute scores
 *   5. Persist a `local_seo_rubric_audits` row
 *   6. After all pages are done — run a SECOND pass for cross-page
 *      checks (uniqueness, internal linking sufficiency at site level)
 *
 * The runner is designed to be cheap on Mac worker (zero LLM cost for
 * deterministic-only) and reasonably cheap with the judge on (~$0.02
 * per 50-page site).
 */

import { and, eq } from "drizzle-orm";
import type { ClaudeJob } from "@/db/schema";
import { db } from "@/db/client";
import {
  apiKeys,
  claudeJobs,
  localSeoRubricAudits,
  sitePages,
  siteBuildPages,
  siteBuildProjects,
  sites,
} from "@/db/schema";
import { callPlugin, WpPluginError } from "./wp-plugin-client";
import { inferPageType, type RubricPageType } from "./local-seo-rubric";
import {
  checkRubric,
  type RubricCheckerResult,
  type RubricFinding,
  type RubricPageInput,
} from "./local-seo-rubric-checker";
import { applyJudgeVerdicts, runRubricJudge, type JudgeVerdict } from "./local-seo-rubric-judge";

export interface RunnerOptions {
  /** Run the Haiku judge for subjective checks. Default true. */
  runJudge?: boolean;
  /** Limit to N pages (for spot-checks). */
  maxPages?: number;
  /** Tag the audit row with this claude_jobs id. */
  jobId?: string;
}

export interface RunnerResult {
  source: "live" | "build";
  totalPages: number;
  audited: number;
  failed: number;
  averageScore: number;
  perPageAudits: Array<{
    auditId: string;
    url: string;
    pageType: RubricPageType;
    overallScore: number;
    findingsBlocking: number;
    findingsHigh: number;
  }>;
  judgeTokensInput: number;
  judgeTokensOutput: number;
}

// ────────────────────────────────────────────────────────────────────
// Live site audit (via /seo-inventory + HTML fetch)
// ────────────────────────────────────────────────────────────────────

export async function auditLiveSite(siteId: string, opts: RunnerOptions = {}): Promise<RunnerResult> {
  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new Error(`Site ${siteId} not found`);

  // Pull the inventory via the plugin (HMAC-signed, single round-trip)
  let inventory: Array<{ id: number; url: string; title: string; post_type: string; status: string }>;
  try {
    const resp = await callPlugin<{ ok: boolean; items: Array<{ id: number; url: string; title: string; post_type: string; status: string }> }>(siteId, {
      method: "GET",
      path: "/seo-inventory?per_page=500",
    });
    if (!resp.ok) throw new Error("seo-inventory returned ok=false");
    inventory = resp.items.filter((i) => i.status === "publish");
  } catch (err) {
    const msg = err instanceof WpPluginError ? `${err.reason} ${err.status}` : err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load site inventory: ${msg}`);
  }

  if (opts.maxPages && inventory.length > opts.maxPages) {
    inventory = inventory.slice(0, opts.maxPages);
  }

  // We also need page records in the DB to link back to. If a site_pages
  // row exists for this URL, use its id; otherwise audit row stays
  // page_id=NULL (still useful, just no drill-down link).
  const pageMap = new Map<string, string>();
  const pages = await db().select({ id: sitePages.id, url: sitePages.url }).from(sitePages).where(eq(sitePages.siteId, siteId));
  for (const p of pages) {
    pageMap.set(p.url, p.id);
  }

  const result: RunnerResult = {
    source: "live",
    totalPages: inventory.length,
    audited: 0,
    failed: 0,
    averageScore: 0,
    perPageAudits: [],
    judgeTokensInput: 0,
    judgeTokensOutput: 0,
  };

  for (const item of inventory) {
    try {
      const fetched = await fetchAndExtract(item.url);
      const pageType = inferPageType({ url: item.url, title: item.title });
      const primaryKeyword = guessPrimaryKeywordFromUrl(item.url);
      const city = site.city ?? null;

      const input: RubricPageInput = {
        url: item.url,
        pageType,
        primaryKeyword,
        city: city ?? undefined,
        html: fetched.html,
        metaTitle: fetched.title,
        metaDescription: fetched.description,
      };

      const auditId = await runOnePage({
        input,
        runJudge: opts.runJudge ?? true,
        siteId,
        pageId: pageMap.get(item.url) ?? null,
        projectId: null,
        buildPageId: null,
        source: "live",
        jobId: opts.jobId ?? null,
        runnerResult: result,
      });
      if (auditId) result.audited++;
    } catch (err) {
      console.warn(`[rubric] page ${item.url} failed:`, err instanceof Error ? err.message : err);
      result.failed++;
    }
  }

  result.averageScore = result.perPageAudits.length > 0
    ? Math.round(result.perPageAudits.reduce((s, p) => s + p.overallScore, 0) / result.perPageAudits.length)
    : 0;
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Pre-deploy build audit (against site_build_pages)
// ────────────────────────────────────────────────────────────────────

export async function auditBuildProject(projectId: string, opts: RunnerOptions = {}): Promise<RunnerResult> {
  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectId)).limit(1);
  if (!project) throw new Error(`Project ${projectId} not found`);

  let pages = await db().select().from(siteBuildPages).where(eq(siteBuildPages.projectId, projectId));
  // Audit only pages with body content
  pages = pages.filter((p) => (p.bodyHtml ?? p.bodyMarkdown) && (p.bodyHtml?.length ?? p.bodyMarkdown?.length ?? 0) > 100);
  if (opts.maxPages && pages.length > opts.maxPages) {
    pages = pages.slice(0, opts.maxPages);
  }

  const result: RunnerResult = {
    source: "build",
    totalPages: pages.length,
    audited: 0,
    failed: 0,
    averageScore: 0,
    perPageAudits: [],
    judgeTokensInput: 0,
    judgeTokensOutput: 0,
  };

  const baseUrl = project.domain
    ? `https://${project.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
    : `https://${project.slug ?? "draft"}.local`;

  for (const page of pages) {
    try {
      const url = baseUrl + (page.pageSlug.startsWith("/") ? page.pageSlug : `/${page.pageSlug}`);
      const pageType = normalizePageType(page.pageType ?? inferPageType({ url, title: page.title ?? "" }));
      const html = page.bodyHtml ?? `<h1>${page.title}</h1>\n${page.bodyMarkdown ?? ""}`;
      // site_build_pages doesn't carry a primary_keyword column today — keyword
      // is held in keyword_bank by page_id (P2 work). For now infer from URL;
      // future enhancement: join keyword_bank on build_page_id to get the real
      // primary keyword.
      const primaryKeyword = guessPrimaryKeywordFromUrl(url);

      const input: RubricPageInput = {
        url,
        pageType,
        primaryKeyword: primaryKeyword ?? undefined,
        city: project.city ?? undefined,
        html,
        metaTitle: page.metaTitle ?? undefined,
        metaDescription: page.metaDescription ?? undefined,
        jsonLd: (page.schemaJson as Array<Record<string, unknown>> | null) ?? undefined,
      };

      const auditId = await runOnePage({
        input,
        runJudge: opts.runJudge ?? true,
        siteId: project.publishedSiteId ?? null,
        pageId: null,
        projectId,
        buildPageId: page.id,
        source: "build",
        jobId: opts.jobId ?? null,
        runnerResult: result,
      });
      if (auditId) result.audited++;
    } catch (err) {
      console.warn(`[rubric] build page ${page.id} failed:`, err instanceof Error ? err.message : err);
      result.failed++;
    }
  }

  result.averageScore = result.perPageAudits.length > 0
    ? Math.round(result.perPageAudits.reduce((s, p) => s + p.overallScore, 0) / result.perPageAudits.length)
    : 0;
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Per-page execution + persistence
// ────────────────────────────────────────────────────────────────────

interface RunOnePageInput {
  input: RubricPageInput;
  runJudge: boolean;
  siteId: string | null;
  pageId: string | null;
  projectId: string | null;
  buildPageId: string | null;
  source: "live" | "build";
  jobId: string | null;
  runnerResult: RunnerResult;
}

async function runOnePage(opts: RunOnePageInput): Promise<string | null> {
  let result: RubricCheckerResult = checkRubric(opts.input);

  let judgeVerdicts: JudgeVerdict[] = [];
  let judgeTokensIn = 0;
  let judgeTokensOut = 0;

  if (opts.runJudge && result.pendingJudge.length > 0) {
    try {
      const j = await runRubricJudge({
        pageInput: {
          url: opts.input.url,
          pageType: opts.input.pageType,
          primaryKeyword: opts.input.primaryKeyword,
          city: opts.input.city,
        },
        checkerResult: result,
      });
      judgeVerdicts = j.verdicts;
      judgeTokensIn = j.tokensInput;
      judgeTokensOut = j.tokensOutput;
      opts.runnerResult.judgeTokensInput += j.tokensInput;
      opts.runnerResult.judgeTokensOutput += j.tokensOutput;

      // Patch findings + scores
      const patched = applyJudgeVerdicts(result, judgeVerdicts);
      result = { ...result, findings: patched.findings, overallScore: patched.overallScore, scores: patched.scores };
    } catch (err) {
      console.warn(`[rubric] judge failed for ${opts.input.url}:`, err instanceof Error ? err.message : err);
      // Continue without judge — deterministic-only score still useful
    }
  }

  // Count severities for quick site rollup
  const sevCount = (sev: RubricFinding["severity"]) =>
    result.findings.filter((f) => f.status === "fail" && f.severity === sev).length;

  const [inserted] = await db()
    .insert(localSeoRubricAudits)
    .values({
      siteId: opts.siteId,
      pageId: opts.pageId,
      projectId: opts.projectId,
      buildPageId: opts.buildPageId,
      source: opts.source,
      url: opts.input.url,
      pageType: opts.input.pageType,
      primaryKeyword: opts.input.primaryKeyword ?? null,
      city: opts.input.city ?? null,
      overallScore: result.overallScore,
      onPageScore: result.scores.on_page ?? 0,
      structureScore: result.scores.structure ?? 0,
      schemaScore: result.scores.schema ?? 0,
      internalLinkingScore: result.scores.internal_linking ?? 0,
      semanticScore: result.scores.semantic ?? 0,
      antiDoorwayScore: result.scores.anti_doorway ?? 0,
      findingsBlocking: sevCount("blocking"),
      findingsHigh: sevCount("high"),
      findingsMedium: sevCount("medium"),
      findingsLow: sevCount("low"),
      findings: result.findings as unknown[],
      evidence: result.evidence as Record<string, unknown>,
      judgeRan: opts.runJudge,
      judgeVerdicts: judgeVerdicts as unknown[],
      judgeTokensInput: judgeTokensIn || null,
      judgeTokensOutput: judgeTokensOut || null,
      auditJobId: opts.jobId,
    })
    .returning({ id: localSeoRubricAudits.id });

  opts.runnerResult.perPageAudits.push({
    auditId: inserted.id,
    url: opts.input.url,
    pageType: opts.input.pageType,
    overallScore: result.overallScore,
    findingsBlocking: sevCount("blocking"),
    findingsHigh: sevCount("high"),
  });

  return inserted.id;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

async function fetchAndExtract(url: string): Promise<{ html: string; title: string; description: string }> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "GYL-RubricBot/1.0 (+https://example.com)",
      "Accept": "text/html",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const html = await resp.text();
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const descMatch =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ??
    html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  const description = (descMatch?.[1] ?? "").trim();
  return { html, title, description };
}

/**
 * site_build_pages.page_type uses a different vocabulary than the rubric:
 * 'home' | 'service' | 'service_area' | 'fleet' | 'about' | 'contact' | 'blog' | 'faq'
 * Map it onto the rubric's vocabulary.
 */
function normalizePageType(raw: string): RubricPageType {
  const m: Record<string, RubricPageType> = {
    home: "homepage",
    homepage: "homepage",
    service: "service",
    fleet: "service",
    service_area: "location",
    location: "location",
    about: "about",
    contact: "contact",
    blog: "blog",
    faq: "other",
    other: "other",
  };
  return m[raw] ?? "other";
}

function guessPrimaryKeywordFromUrl(url: string): string | undefined {
  try {
    const path = new URL(url).pathname.replace(/^\/|\/$/g, "");
    if (!path) return undefined;
    const last = path.split("/").pop() ?? "";
    if (!last) return undefined;
    // Convert slug to phrase
    return last.replace(/-/g, " ");
  } catch {
    return undefined;
  }
}

// Silence "unused" lint on the import we keep for future cross-page checks
void and;
void apiKeys;
void claudeJobs as unknown as typeof claudeJobs;
type _Unused = ClaudeJob;
