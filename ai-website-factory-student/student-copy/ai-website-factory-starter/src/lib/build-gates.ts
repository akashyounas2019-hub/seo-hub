/**
 * Build-phase validation gates.
 *
 * The build pipeline (research → dna → sitemap → pages → review → deploy)
 * used to advance on `job.status === "done"` alone. That was a "valid
 * shape, no quality" gate — a job could finish with a 50-char output and
 * still pass. This module evaluates the actual content per phase.
 *
 * Each gate returns:
 *   - `ok`        — true if the admin should be allowed to advance freely
 *   - `score`     — 0-100, a single number summarising quality
 *   - `blocking`  — issues that block advancement (mapped to score < 50)
 *   - `warnings`  — issues to surface but not block
 *   - `summary`   — one short sentence for the UI
 *
 * The admin can still force-advance from any state; the server-side
 * `advancePhaseAction` re-runs the gate and logs an audit row when an
 * override happens.
 */

import type { SiteBuildPage, SiteBuildProject, ClaudeJob } from "@/db/schema";

export interface PhaseGateResult {
  ok: boolean;
  score: number;
  blocking: string[];
  warnings: string[];
  summary: string;
  /** Pretty label of the phase being gated. */
  phaseLabel: string;
}

type Phase =
  | "brief"
  | "research"
  | "dna"
  | "sitemap"
  | "pages"
  | "review"
  | "deploy"
  | "live";

/**
 * Score → ok mapping. ≥70 is the same threshold the SEO critic uses for
 * auto-apply. Below that, advancement is held for review.
 */
const ADVANCE_THRESHOLD = 70;

export function evaluatePhaseGate(
  phase: Phase,
  project: SiteBuildProject,
  job: ClaudeJob | undefined,
  pages: SiteBuildPage[],
): PhaseGateResult {
  switch (phase) {
    case "brief":
      return evaluateBriefGate(project);
    case "research":
      return evaluateResearchGate(project, job);
    case "dna":
      return evaluateDnaGate(project, job);
    case "sitemap":
      return evaluateSitemapGate(project, job, pages);
    case "pages":
      return evaluatePagesGate(pages);
    case "review":
      return evaluateReviewGate(project, job);
    case "deploy":
    case "live":
      // No gate — these are admin-driven transitions, not LLM output.
      return {
        ok: true,
        score: 100,
        blocking: [],
        warnings: [],
        summary: "No content gate at this phase.",
        phaseLabel: phase === "deploy" ? "Deploy" : "Live",
      };
  }
}

// ───────── brief ─────────

function evaluateBriefGate(project: SiteBuildProject): PhaseGateResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!project.businessName?.trim()) blocking.push("Missing business name");
  if (!project.city?.trim()) blocking.push("Missing target city");
  const services = (project.services ?? []) as string[];
  if (!services.length) blocking.push("No services selected — agent has no scope");
  if (!project.contentNotes?.trim()) {
    warnings.push("No content notes — the agent will fill in from generic templates");
  }
  return finalize("Brief", blocking, warnings);
}

// ───────── research ─────────

function evaluateResearchGate(
  project: SiteBuildProject,
  job: ClaudeJob | undefined,
): PhaseGateResult {
  const blocking: string[] = [];
  const warnings: string[] = [];

  const md = extractMarkdown(project.research) || job?.outputMarkdown || "";
  if (md.length < 1000) {
    blocking.push(`Research output is ${md.length} chars — research should produce 1000+ chars of intel`);
  }

  const competitorUrls = uniqueExternalUrls(md);
  if (competitorUrls.length < 3) {
    blocking.push(
      `Only ${competitorUrls.length} competitor URL${competitorUrls.length === 1 ? "" : "s"} found — research should surface ≥3 real competitors`,
    );
  } else if (competitorUrls.length < 5) {
    warnings.push(`${competitorUrls.length} competitor URLs — 5+ is healthier`);
  }

  const city = project.city?.trim();
  if (city && !new RegExp(`\\b${escapeRe(city)}\\b`, "i").test(md)) {
    blocking.push(`Research never mentions the target city "${city}"`);
  }

  // Generic-filler check — if the same boilerplate phrases dominate,
  // the agent didn't actually do new research.
  const genericPhrases = [
    /\bworld[- ]?class\b/i,
    /\bcreate engaging content\b/i,
    /\bunique value proposition\b/i,
  ];
  const hits = genericPhrases.filter((re) => re.test(md)).length;
  if (hits >= 2) warnings.push("Output contains 2+ generic SEO clichés — possible filler");

  return finalize("Global research", blocking, warnings);
}

// ───────── design DNA ─────────

function evaluateDnaGate(
  project: SiteBuildProject,
  job: ClaudeJob | undefined,
): PhaseGateResult {
  const blocking: string[] = [];
  const warnings: string[] = [];

  const md = extractMarkdown(project.designDna) || job?.outputMarkdown || "";
  if (md.length < 600) {
    blocking.push(`Design DNA is ${md.length} chars — needs at least 600`);
  }

  // Must call out a palette — at minimum 3 hex codes.
  const hex = new Set((md.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((s) => s.toLowerCase()));
  if (hex.size < 3) {
    blocking.push(`Only ${hex.size} unique hex color${hex.size === 1 ? "" : "s"} — palette needs 3+`);
  }

  // Should specify a font system — match common font-family signals.
  if (!/\bfont[- ]?family\b|\bfont[- ]?stack\b|\btypeface\b/i.test(md)) {
    warnings.push("No explicit font-family / typeface stanza — typography may be ad-hoc");
  }

  // Should call out at least one section / hero treatment.
  if (!/\bhero\b/i.test(md)) {
    warnings.push("DNA never mentions 'hero' — what does the homepage feel like at first paint?");
  }

  return finalize("Design DNA", blocking, warnings);
}

// ───────── sitemap ─────────

function evaluateSitemapGate(
  project: SiteBuildProject,
  job: ClaudeJob | undefined,
  pages: SiteBuildPage[],
): PhaseGateResult {
  const blocking: string[] = [];
  const warnings: string[] = [];

  // After the sitemap job runs, the worker should have populated
  // site_build_pages. Count those first; fall back to parsing markdown
  // headings if not yet inserted.
  let pageCount = pages.length;
  if (pageCount === 0) {
    const md = extractMarkdown(project.sitemap) || job?.outputMarkdown || "";
    pageCount = (md.match(/^\s*[-*]\s+/gm) ?? []).length;
  }
  if (pageCount < 3) {
    blocking.push(`Only ${pageCount} pages planned — sitemap needs at least 3`);
  } else if (pageCount < 5) {
    warnings.push(`${pageCount} pages planned — most cleaning-services sites need 6-12`);
  }

  // Should include a home + at least one service page + a contact page.
  if (pages.length > 0) {
    const types = new Set(pages.map((p) => p.pageType));
    if (!types.has("home")) blocking.push("Sitemap has no home page");
    if (!types.has("contact")) warnings.push("Sitemap has no contact page");
    if (!types.has("service") && !types.has("service_area")) {
      warnings.push("Sitemap has no service / service-area page");
    }
  }

  return finalize("Sitemap", blocking, warnings);
}

// ───────── pages ─────────

function evaluatePagesGate(pages: SiteBuildPage[]): PhaseGateResult {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (pages.length === 0) {
    blocking.push("No pages exist for this project");
    return finalize("Pages", blocking, warnings);
  }

  const unready = pages.filter(
    (p) => p.status !== "ready" && p.status !== "edited" && p.status !== "published",
  );
  if (unready.length > 0) {
    blocking.push(
      `${unready.length}/${pages.length} page${unready.length === 1 ? "" : "s"} still ${unready[0].status === "pending" ? "pending" : unready[0].status === "generating" ? "generating" : "not ready"}`,
    );
  }

  const noBody = pages.filter((p) => !p.bodyHtml || p.bodyHtml.length < 200);
  if (noBody.length > 0) {
    blocking.push(
      `${noBody.length} page${noBody.length === 1 ? " has" : "s have"} empty / tiny bodies (<200 chars)`,
    );
  }

  const lowSeo = pages.filter(
    (p) => p.seoScore !== null && p.seoScore !== undefined && p.seoScore < 60,
  );
  if (lowSeo.length > 0) {
    warnings.push(
      `${lowSeo.length} page${lowSeo.length === 1 ? "" : "s"} scoring <60 on SEO`,
    );
  }

  const lowAi = pages.filter(
    (p) =>
      p.aiOverviewScore !== null && p.aiOverviewScore !== undefined && p.aiOverviewScore < 50,
  );
  if (lowAi.length > 0) {
    warnings.push(
      `${lowAi.length} page${lowAi.length === 1 ? "" : "s"} scoring <50 on AI Overview readiness`,
    );
  }

  // Missing meta basics — these are cheap to enforce.
  const noTitle = pages.filter((p) => !p.metaTitle?.trim()).length;
  const noDesc = pages.filter((p) => !p.metaDescription?.trim()).length;
  if (noTitle > 0) blocking.push(`${noTitle} page${noTitle === 1 ? "" : "s"} missing meta title`);
  if (noDesc > 0) warnings.push(`${noDesc} page${noDesc === 1 ? "" : "s"} missing meta description`);

  return finalize("Pages", blocking, warnings);
}

// ───────── review ─────────

function evaluateReviewGate(
  project: SiteBuildProject,
  job: ClaudeJob | undefined,
): PhaseGateResult {
  const blocking: string[] = [];
  const warnings: string[] = [];

  const report = (project.qualityReport ?? job?.output ?? {}) as Record<string, unknown>;
  const overall =
    typeof report.overall_score === "number"
      ? report.overall_score
      : typeof report.score === "number"
        ? report.score
        : null;
  if (overall === null) {
    blocking.push("Quality review didn't produce an overall_score field");
  } else if (overall < 70) {
    blocking.push(`Quality review scored ${overall}/100 — below 70 ship threshold`);
  } else if (overall < 85) {
    warnings.push(`Quality review scored ${overall}/100 — solid but not exceptional`);
  }

  const criticalIssues = report.critical_issues;
  if (Array.isArray(criticalIssues) && criticalIssues.length > 0) {
    blocking.push(`${criticalIssues.length} critical issue${criticalIssues.length === 1 ? "" : "s"} flagged by reviewer`);
  }

  return finalize("Quality review", blocking, warnings);
}

// ───────── helpers ─────────

function finalize(
  label: string,
  blocking: string[],
  warnings: string[],
): PhaseGateResult {
  // Score model: start at 100, blocking issues cost 20 each, warnings 5 each.
  // 0 floor, 100 ceiling.
  const score = Math.max(
    0,
    Math.min(100, 100 - blocking.length * 20 - warnings.length * 5),
  );
  const ok = blocking.length === 0 && score >= ADVANCE_THRESHOLD;
  const summary =
    blocking.length === 0 && warnings.length === 0
      ? "All checks pass."
      : blocking.length > 0
        ? `${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"} · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
        : `${warnings.length} warning${warnings.length === 1 ? "" : "s"} — review before advancing`;
  return { ok, score, blocking, warnings, summary, phaseLabel: label };
}

function extractMarkdown(field: unknown): string {
  if (!field || typeof field !== "object") return "";
  const md = (field as Record<string, unknown>).markdown;
  return typeof md === "string" ? md : "";
}

function uniqueExternalUrls(md: string): string[] {
  const matches = md.match(/https?:\/\/[^\s)>\]"']+/g) ?? [];
  const set = new Set(
    matches
      .map((u) => u.replace(/[.,;:!?]+$/, ""))
      .filter((u) => {
        try {
          const host = new URL(u).hostname.toLowerCase();
          // Don't count self-references or vague-helper domains
          return !host.includes("example.com");
        } catch {
          return false;
        }
      }),
  );
  return [...set];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { ADVANCE_THRESHOLD };
