/**
 * Pre-publish quality gauntlet.
 *
 * Before a generated build page hits the live WordPress site, it goes
 * through six checks in this file. Three are deterministic (schema, EEAT
 * signals, structural variance, authenticity), three are external
 * (AI Overview pass via Claude, accessibility via Playwright + axe-core,
 * originality via web_search). The gauntlet returns a single overall
 * verdict — `pass`, `pass_with_warnings`, or `block` — and a structured
 * report of every check.
 *
 * This is the #1 lever against Google's "scaled content abuse" penalty
 * for AI-generated sites. We block (not warn) on:
 *   - Schema structural errors
 *   - Missing EEAT signals (no About link, no LocalBusiness schema)
 *   - Authenticity score < threshold (too few first-hand markers)
 *   - Structural skeleton shared with 3+ other pages in the project
 *   - Critical accessibility violations
 *
 * Warnings (but allow publish) on:
 *   - Schema warnings
 *   - Originality borderline (50-70% similarity to top SERPs)
 *   - AI Overview grade < "fair"
 *   - Serious-but-not-critical a11y violations
 *
 * Usage: `await runPublishGauntlet(pageId, { skipExternal: false })`
 */

import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { claudeJobs, siteBuildPages, siteBuildProjects } from "@/db/schema";
import { suggestAiOverviewImprovements, type AiOverviewSuggestions } from "./ai-overview-pass";
import {
  detectDoorway,
  DOORWAY_MIN_UNIQUE_ENTITIES,
  DOORWAY_SIMILARITY_THRESHOLD,
  type DoorwayResult,
} from "./doorway-detector";
import { getLLMClient } from "./llm";
import { validateJsonLd, type SchemaValidation } from "./schema-validator";
import { checkUrlAccessibility, type AccessibilityResult } from "./url-preview-capture";

// ────────── Types ──────────

export type CheckStatus = "pass" | "warn" | "block";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  /** Short reason — shown to the operator in chat. */
  summary: string;
  /** Structured detail — schema errors, axe violations, similarity scores, etc. */
  detail: unknown;
}

export interface GauntletReport {
  page_id: string;
  page_title: string;
  ran_at: string;
  verdict: "pass" | "pass_with_warnings" | "block";
  block_count: number;
  warn_count: number;
  pass_count: number;
  checks: CheckResult[];
  /** Top 3 fixes ranked by impact. */
  top_fixes: string[];
}

export interface GauntletOptions {
  /** Skip external checks (AI Overview Claude call + accessibility Playwright + originality web_search) for fast feedback. */
  skipExternal?: boolean;
  /** Override the live URL used by external checks. If unset, derived from the project's domain or skipped. */
  liveUrl?: string;
  /** Anthropic client + model — passed by caller (already authenticated via getLLMClient). */
  client?: Anthropic;
  model?: string;
}

// ────────── Threshold constants ──────────

const AUTHENTICITY_MIN_MARKERS_PER_1K = 5;
const AUTHENTICITY_BLOCK_THRESHOLD = 3; // < 3 markers/1k = block
const STRUCTURAL_VARIANCE_BLOCK_THRESHOLD = 3; // same skeleton on 3+ other pages = block
const ORIGINALITY_BLOCK_SIMILARITY = 0.7; // > 70% similarity to top SERPs = block

// ────────── Authenticity scorer (deterministic) ──────────

/**
 * Count "first-hand markers" — specific signals that a human with industry
 * experience wrote the page (not generic LLM prose). Markers, tuned for the
 * Dubai cleaning-services vertical:
 *   - Specific prices with units (AED 350, AED 95/hr, AED 1,200/villa)
 *   - Concrete measurements (3-bedroom villa, 220 sqft office, 60-point checklist)
 *   - Named people (team lead names, founder names, real review quotes)
 *   - Named places (Dubai neighborhoods, specific towers, freezone names)
 *   - License + trade licence numbers (Dubai Municipality / DED registration)
 *   - Year founded / years in business
 *
 * Returns a per-1000-words density.
 */
export function authenticityScore(body: string): {
  markers: number;
  word_count: number;
  per_1k_words: number;
  sample_matches: string[];
} {
  const words = body.split(/\s+/).filter(Boolean).length || 1;
  const matches: string[] = [];

  // Specific prices (AED 95, AED 350/villa, AED 1,200/month)
  for (const m of body.match(/\bAED\s*\d{2,5}(?:[.,]\d{1,2})?(?:\s*\/\s*(?:hr|hour|day|month|villa|apartment|room|sqft|sqm))?/gi) ?? []) {
    matches.push(`price:${m}`);
  }
  // Times + measurements (3 hours, 60-point checklist, 220 sqft, 4-bedroom villa)
  for (const m of body.match(/\b\d{1,4}\s*(?:minute|min|hour|hr|hours|point|bedroom|bed|sqft|sqm|m²)\b/gi) ?? []) {
    matches.push(`unit:${m}`);
  }
  // Years (founded 2014, since 2020, 8 years)
  for (const m of body.match(/\b(?:founded|since|established|operating since|in business since|for over)\s*\d{1,2}\s*(?:years?|yrs?)\b|\b(?:founded|since|established)\s+(?:in\s+)?\d{4}\b/gi) ?? []) {
    matches.push(`tenure:${m}`);
  }
  // Concrete cleaning-service specifics ("60-point checklist", "4-hour deep clean")
  for (const m of body.match(/\b\d{1,3}[\s-](?:point|room|bedroom|bathroom)\s+(?:checklist|clean|deep-clean|service)\b/gi) ?? []) {
    matches.push(`specific:${m}`);
  }
  // Dubai / UAE neighborhoods, towers, freezones — the UAE cleaning demographic.
  const NEIGHBORHOODS = [
    "palm jumeirah", "emirates hills", "dubai marina", "downtown dubai", "difc",
    "jbr", "jumeirah beach residence", "business bay", "dubai hills", "arabian ranches",
    "jumeirah", "al barsha", "jvc", "jumeirah village circle", "silicon oasis",
    "meadows", "the springs", "the greens", "damac hills", "mira oasis",
    "mirdif", "al furjan", "motor city", "sports city", "discovery gardens",
    "international city", "dubai south", "al quoz", "al warqa",
    "abu dhabi", "sharjah", "ajman",
  ];
  const bodyLower = body.toLowerCase();
  for (const n of NEIGHBORHOODS) {
    if (bodyLower.includes(n)) matches.push(`place:${n}`);
  }
  // UAE phone numbers (+971 5x xxx xxxx, 04-xxxxxxx)
  for (const m of body.match(/\b(?:\+?971[\s.-]?)?(?:0?[245][\s.-]?\d{3}[\s.-]?\d{4}|5\d[\s.-]?\d{3}[\s.-]?\d{4})\b/g) ?? []) {
    matches.push(`phone:${m}`);
  }
  // Team / staff name pattern ("team lead Amara", "Aisha, our senior cleaner")
  for (const m of body.match(/\b(?:cleaner|team lead|supervisor|auditor|founder|owner|manager|operator)[,\s]+(?:our\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) ?? []) {
    matches.push(`person:${m}`);
  }
  // Regulatory specificity — Dubai / UAE cleaning-services licensing.
  // DED trade licence numbers, Dubai Municipality permits.
  for (const m of body.match(/\b(?:DED|DM|DUBAI\s+MUNICIPALITY|TRADE\s+LICENCE|TRN)[\s#-]?\d{4,10}\b/gi) ?? []) {
    matches.push(`license:${m}`);
  }
  // Real review quote markers (quoted speech > 8 words attributed to a person)
  for (const m of body.match(/"[^"]{40,250}"\s*[—\-–]\s*[A-Z][a-z]+/g) ?? []) {
    matches.push(`review:${m.slice(0, 80)}`);
  }

  const markers = matches.length;
  const per_1k_words = (markers / words) * 1000;
  return {
    markers,
    word_count: words,
    per_1k_words: Math.round(per_1k_words * 10) / 10,
    sample_matches: matches.slice(0, 15),
  };
}

// ────────── P10 — Citation coverage (deterministic) ──────────

/**
 * Scan a markdown body for factual claims that aren't backed by a citation.
 *
 * Uncited factual claims are the #1 thing that flips Google's quality classifier
 * against AI-generated content. Blog posts that quote statistics, dates, and
 * proper-noun authority figures without linking to a real source read as
 * "AI-fabricated" — even when they're correct.
 *
 * What counts as a "claim that needs a citation":
 *   - Specific statistics ("73% of travelers...", "40% of pages get de-indexed")
 *   - Specific years tied to external events ("Niagara was designated... in 1819")
 *   - Dollar figures with broader context ("the wine industry generates $X billion")
 *   - Named experts/authorities being quoted ("Dr. Smith says...")
 *
 * What does NOT need a citation:
 *   - Operator's own facts ("we run a 60-point checklist", "we charge from AED 350")
 *   - Generally-known facts ("Palm Jumeirah is in Dubai")
 *   - Subjective evaluations ("the bench has cooler microclimates")
 *
 * What counts as "cited":
 *   - Markdown link near the claim — [text](https://...)
 *   - "according to <NamedAuthority>" phrasing
 *   - "[CITATION_NEEDED]" tag — counts as "the writer flagged it for you"
 *
 * Returns: `{ total_claims, cited, uncited_samples, uncited_count, citation_needed_count }`.
 */
export function citationCoverage(body: string): {
  total_claims: number;
  cited: number;
  uncited_count: number;
  citation_needed_count: number;
  uncited_samples: string[];
} {
  const lines = body.split("\n");
  const uncited: string[] = [];
  let totalClaims = 0;
  let cited = 0;
  let citationNeeded = 0;

  // Operator-fact patterns — these are facts the operator stated, not external claims.
  // If a sentence contains "we", "our", "since [year]", or a TBD placeholder, skip it.
  const isOperatorFact = (s: string): boolean => {
    return (
      /\bwe\s/.test(s) ||
      /\bour\s/.test(s) ||
      /\bus\b/.test(s) ||
      /\$XX|XXX-XXXX|\[TBD\]|placeholder/i.test(s)
    );
  };

  // External-claim patterns — these likely need a citation.
  const claimPatterns = [
    // Statistics with explicit percentages or counts
    /\b\d{1,3}(?:\.\d{1,2})?%\s+of\s+/i,
    /\b(?:over|more than|under|less than)\s+\d{1,5}(?:,\d{3})*\s+(?:tourists|visitors|travelers|guests|customers|wineries|estates|restaurants|hotels|residents)\b/i,
    // Year-specific historic events
    /\bin\s+(?:18|19|20)\d{2}[,.]?\s+(?:the\s+)?(?:[A-Z][a-z]+\s+){1,4}(?:was|were|became|opened|established|founded|launched|joined|merged)\b/,
    // Industry / economy figures
    /\b\$\d{1,3}(?:\.\d{1,2})?\s*(?:million|billion|trillion)\s+(?:industry|market|economy|sector|revenue|exports?)\b/i,
    // Named authority assertion
    /\baccording to\s+[A-Z][a-zA-Z\s,.&'-]{2,60}(?:\s+says?|\s+reports?|\s+notes?|[,.]|$)/,
    // Climate / environmental specifics ("average temperature of XX°C")
    /\baverage (?:temperature|rainfall|snowfall|elevation|distance)\s+of\s+\d/i,
    // Awards / rankings with specific numbers
    /\branked?\s+(?:#?\d{1,3}|top\s+\d{1,3})\s+(?:in|of|by|among|on)\s+/i,
  ];

  // Citation-presence detectors
  const isCited = (s: string): boolean => {
    if (/\[CITATION_NEEDED\]/i.test(s)) {
      citationNeeded++;
      return true; // counts as "flagged for human", we want to surface but not block
    }
    // Markdown link
    if (/\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(s)) return true;
    // Inline URL
    if (/https?:\/\/\S+/.test(s)) return true;
    // "according to <Authority> ([source name])"
    if (/\baccording to\s+[A-Z][^.;,]*?\([^)]+\)/.test(s)) return true;
    return false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("##")) continue;
    // Operator's own facts don't need citation
    if (isOperatorFact(trimmed)) continue;

    let hasClaim = false;
    for (const pat of claimPatterns) {
      if (pat.test(trimmed)) {
        hasClaim = true;
        break;
      }
    }
    if (!hasClaim) continue;

    totalClaims++;
    if (isCited(trimmed)) {
      cited++;
    } else {
      // Save first ~120 chars of the offending line as a sample
      if (uncited.length < 10) uncited.push(trimmed.slice(0, 140));
    }
  }

  return {
    total_claims: totalClaims,
    cited,
    uncited_count: totalClaims - cited,
    citation_needed_count: citationNeeded,
    uncited_samples: uncited,
  };
}

// ────────── Structural variance (deterministic) ──────────

/**
 * Extract a "skeleton" fingerprint from a markdown page body — the
 * normalized sequence of headings + section count. Two pages with the
 * same skeleton are almost certainly AI batch-generated from the same
 * template, which is the #1 fingerprint Google's classifiers look for.
 */
export function pageSkeleton(body: string): string {
  const headings = body.match(/^(#{1,6})\s+(.+)$/gm) ?? [];
  // For each heading: keep level + first 2 words normalized
  const fingerprint = headings.map((h) => {
    const m = h.match(/^(#{1,6})\s+(.+)$/);
    if (!m) return "";
    const level = m[1].length;
    const text = m[2].toLowerCase().replace(/[^a-z\s]/g, "").trim();
    const firstTwo = text.split(/\s+/).slice(0, 2).join(" ");
    return `h${level}:${firstTwo}`;
  }).filter(Boolean).join("|");
  return fingerprint;
}

/** Check how many sibling pages in the same project share this exact skeleton. */
async function checkStructuralVariance(
  projectId: string,
  pageId: string,
  body: string,
): Promise<{ skeleton: string; matches_count: number; matched_page_ids: string[] }> {
  const skeleton = pageSkeleton(body);
  if (!skeleton) return { skeleton: "", matches_count: 0, matched_page_ids: [] };

  const siblings = await db()
    .select({ id: siteBuildPages.id, bodyMarkdown: siteBuildPages.bodyMarkdown })
    .from(siteBuildPages)
    .where(and(eq(siteBuildPages.projectId, projectId), ne(siteBuildPages.id, pageId)));

  const matched: string[] = [];
  for (const s of siblings) {
    if (!s.bodyMarkdown) continue;
    if (pageSkeleton(s.bodyMarkdown) === skeleton) matched.push(s.id);
  }
  return { skeleton, matches_count: matched.length, matched_page_ids: matched };
}

// ────────── Doorway detector (deterministic) ──────────

/**
 * Run the doorway/scaled-content detector for a page against its same-type
 * siblings in the SAME build project. We compare against same-`pageType`
 * pages only — a `service_area` page should be compared to other
 * `service_area` pages (the "swap-the-city" fleet), not to the home page or a
 * blog post.
 *
 * Siblings are pulled from `site_build_pages` (the only table that holds the
 * generated body text). The WP `site_pages` catalogue has no body, only a word
 * count, so it can't feed a text-similarity check.
 */
async function checkDoorway(
  projectId: string,
  pageId: string,
  page: { pageSlug: string; title: string; pageType: string; bodyMarkdown: string },
): Promise<DoorwayResult> {
  const siblings = await db()
    .select({
      id: siteBuildPages.id,
      pageSlug: siteBuildPages.pageSlug,
      title: siteBuildPages.title,
      bodyMarkdown: siteBuildPages.bodyMarkdown,
    })
    .from(siteBuildPages)
    .where(
      and(
        eq(siteBuildPages.projectId, projectId),
        eq(siteBuildPages.pageType, page.pageType),
        ne(siteBuildPages.id, pageId),
      ),
    );

  return detectDoorway(
    { slug: page.pageSlug, title: page.title, bodyText: page.bodyMarkdown },
    siblings.map((s) => ({
      slug: s.pageSlug,
      title: s.title,
      bodyText: s.bodyMarkdown ?? "",
    })),
  );
}

// ────────── EEAT signal checker (deterministic) ──────────

export interface EeatSignals {
  has_about_link: boolean;
  has_author_byline: boolean;
  has_local_business_schema: boolean;
  has_contact_info: boolean;
  has_industry_citation: boolean;
  score: number; // 0-5
  missing: string[];
}

export function checkEeatSignals(
  body: string,
  schemaJson: Array<Record<string, unknown>>,
): EeatSignals {
  const lower = body.toLowerCase();

  // About-page link — /about, about us, our story
  const has_about_link = /\[(?:[^\]]*)\]\(\/about[\w/]*\)/i.test(body)
    || /\[(?:[^\]]*)\]\(\/(?:our[-\s]?story|company|team)[\w/]*\)/i.test(body);

  // Author byline — "By <Name>" or "Written by" or schema author
  const has_author_byline = /(?:^|\n)\s*(?:by|written by|author:)\s+[A-Z][a-z]+/i.test(body)
    || schemaJson.some((b) => typeof b.author === "object" && b.author !== null);

  // LocalBusiness / Organization schema present
  const has_local_business_schema = schemaJson.some((b) => {
    const t = b["@type"];
    const types = Array.isArray(t) ? t : [t];
    return types.some((x) =>
      ["LocalBusiness", "ProfessionalService", "AutomotiveBusiness", "TaxiService", "LimousineService", "Organization"].includes(
        typeof x === "string" ? x : "",
      ),
    );
  });

  // Contact info — tel: link OR phone pattern OR mailto: OR full address
  const has_contact_info =
    /\[[^\]]+\]\(tel:[\d+\-\s()]+\)/i.test(body)
    || /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(body)
    || /\[[^\]]+\]\(mailto:[^\s)]+\)/i.test(body);

  // Industry citation — link to BBB, Better Business Bureau, GMB / Google Business,
  // industry association (LCT, NLA, GBTA, etc.) or licensing body
  const has_industry_citation =
    /\b(?:bbb\.org|better business bureau|google business|business\.google\.com|nlaride|lctmag|gbta|tssa\.org|mto\.gov\.on\.ca)\b/i.test(lower);

  const missing: string[] = [];
  if (!has_about_link) missing.push("link to /about page");
  if (!has_author_byline) missing.push("author byline (e.g. 'By Wali Shah')");
  if (!has_local_business_schema) missing.push("LocalBusiness/Organization JSON-LD schema");
  if (!has_contact_info) missing.push("phone/email/address contact element");
  if (!has_industry_citation) missing.push("citation to BBB / GMB / industry association");

  const score =
    Number(has_about_link) +
    Number(has_author_byline) +
    Number(has_local_business_schema) +
    Number(has_contact_info) +
    Number(has_industry_citation);

  return {
    has_about_link,
    has_author_byline,
    has_local_business_schema,
    has_contact_info,
    has_industry_citation,
    score,
    missing,
  };
}

// ────────── Originality check (external — uses web_search via Claude) ──────────

/**
 * Ask Claude to fetch the top 3 SERP results for the target keyword and
 * estimate lexical/structural similarity vs the page body. Returns 0-1
 * where 1 = identical to top result. > 0.7 = block.
 *
 * Uses the heavy model + the server-side web_search tool. This is the
 * single most expensive check in the gauntlet (~$0.05/page).
 */
async function checkOriginality(
  client: Anthropic,
  model: string,
  opts: { pageBody: string; targetKeyword: string; targetCity: string },
): Promise<{ max_similarity: number; verdict: "ok" | "borderline" | "too_similar"; competitor_summary: string; error?: string }> {
  const prompt = `
Search the web for the top 3 ranking pages for "${opts.targetKeyword}" in ${opts.targetCity}.
For each, compare to the following candidate page body (paying attention to: section
structure, sentence patterns, exact phrases, FAQ overlap, schema markup).

Rate maximum similarity 0.0 (totally original) to 1.0 (identical / paraphrased).
Anything > 0.7 means the candidate page is too derivative to publish.

Output STRICTLY valid JSON ONLY:
{
  "max_similarity": <0..1 number>,
  "verdict": "ok" | "borderline" | "too_similar",
  "competitor_summary": "1-2 sentence summary of what's already out there + how the candidate differs (or doesn't)"
}

--- CANDIDATE PAGE BODY ---
${opts.pageBody.slice(0, 6000)}
--- END ---
`.trim();

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as any],
      messages: [{ role: "user", content: prompt }],
    });
    // Run the tool-use loop manually — for a one-shot call this is just
    // "keep going until end_turn"
    let final = response;
    let safety = 0;
    while (final.stop_reason === "tool_use" && safety++ < 4) {
      // Anthropic handles server tool execution; just re-call with same context
      final = await client.messages.create({
        model,
        max_tokens: 1024,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as any],
        messages: [{ role: "user", content: prompt }, { role: "assistant", content: final.content }],
      });
    }
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const sim = typeof parsed.max_similarity === "number" ? parsed.max_similarity : Number(parsed.max_similarity);
    return {
      max_similarity: Number.isFinite(sim) ? sim : 0,
      verdict: parsed.verdict === "ok" || parsed.verdict === "borderline" || parsed.verdict === "too_similar"
        ? (parsed.verdict as "ok" | "borderline" | "too_similar")
        : "ok",
      competitor_summary: typeof parsed.competitor_summary === "string" ? parsed.competitor_summary : "",
    };
  } catch (err) {
    return {
      max_similarity: 0,
      verdict: "ok",
      competitor_summary: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ────────── Orchestrator ──────────

export async function runPublishGauntlet(
  pageId: string,
  opts: GauntletOptions = {},
): Promise<GauntletReport> {
  const [page] = await db().select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
  if (!page) throw new Error(`Page ${pageId} not found`);
  const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, page.projectId)).limit(1);
  if (!project) throw new Error(`Parent project ${page.projectId} not found`);

  const body = page.bodyMarkdown ?? "";
  if (!body) {
    return {
      page_id: pageId,
      page_title: page.title,
      ran_at: new Date().toISOString(),
      verdict: "block",
      block_count: 1,
      warn_count: 0,
      pass_count: 0,
      checks: [{ name: "page_has_body", status: "block", summary: "Page has no bodyMarkdown — generate first.", detail: null }],
      top_fixes: ["Generate the page body first"],
    };
  }

  const schemaJson = Array.isArray(page.schemaJson) ? page.schemaJson : [];

  // ── 1. Schema validator (deterministic) ─────────────────────
  const schemaResults = schemaJson.map((b) => validateJsonLd(b));
  const schemaErrors = schemaResults.flatMap((r) => (r.ok ? [] : r.errors));
  const schemaCheck: CheckResult = {
    name: "schema",
    status: schemaErrors.length > 0 ? "block" : "pass",
    summary:
      schemaErrors.length > 0
        ? `${schemaErrors.length} structural error(s) across ${schemaJson.length} JSON-LD block(s)`
        : schemaJson.length === 0
          ? "No schema blocks present (warning)"
          : `${schemaJson.length} schema block(s) clean`,
    detail: { per_block: schemaResults as SchemaValidation[], block_count: schemaJson.length },
  };
  if (schemaJson.length === 0 && schemaCheck.status === "pass") schemaCheck.status = "warn";

  // ── 2. EEAT signals (deterministic) ─────────────────────────
  const eeat = checkEeatSignals(body, schemaJson);
  const eeatCheck: CheckResult = {
    name: "eeat_signals",
    status: eeat.score >= 4 ? "pass" : eeat.score >= 2 ? "warn" : "block",
    summary: `${eeat.score}/5 EEAT signals present${eeat.missing.length > 0 ? ` · missing: ${eeat.missing.join(", ")}` : ""}`,
    detail: eeat,
  };

  // ── 3. Authenticity score (deterministic) ───────────────────
  const auth = authenticityScore(body);
  const authStatus: CheckStatus =
    auth.per_1k_words >= AUTHENTICITY_MIN_MARKERS_PER_1K
      ? "pass"
      : auth.per_1k_words >= AUTHENTICITY_BLOCK_THRESHOLD
        ? "warn"
        : "block";
  const authCheck: CheckResult = {
    name: "authenticity",
    status: authStatus,
    summary: `${auth.per_1k_words} first-hand markers per 1k words (${auth.markers} total in ${auth.word_count} words). Threshold: ${AUTHENTICITY_MIN_MARKERS_PER_1K}/1k for pass, < ${AUTHENTICITY_BLOCK_THRESHOLD}/1k blocks.`,
    detail: auth,
  };

  // ── 4. Structural variance (deterministic) ──────────────────
  const structural = await checkStructuralVariance(page.projectId, pageId, body);
  const structuralCheck: CheckResult = {
    name: "structural_variance",
    status:
      structural.matches_count >= STRUCTURAL_VARIANCE_BLOCK_THRESHOLD
        ? "block"
        : structural.matches_count >= 1
          ? "warn"
          : "pass",
    summary:
      structural.matches_count >= STRUCTURAL_VARIANCE_BLOCK_THRESHOLD
        ? `Skeleton shared with ${structural.matches_count} other pages — Google flags this as templated content. Vary heading order, length, and sections.`
        : structural.matches_count >= 1
          ? `Skeleton shared with ${structural.matches_count} other page(s) — okay but consider varying.`
          : "Unique heading skeleton across the project.",
    detail: structural,
  };

  // ── 5. P10 — Citation coverage (deterministic) ──────────────
  // For blog posts, missing citations on factual claims = AI-fabrication
  // signal that Google's classifier flags. Block if > 3 uncited claims OR
  // if more than 30% of claims are uncited. Warn at 1-3 uncited.
  const citation = citationCoverage(body);
  const isBlog = page.pageType === "blog";
  const uncitedRatio = citation.total_claims === 0 ? 0 : citation.uncited_count / citation.total_claims;
  const citationStatus: CheckStatus = (() => {
    if (citation.total_claims === 0) return "pass"; // nothing to cite
    if (isBlog && citation.uncited_count > 3) return "block";
    if (isBlog && uncitedRatio > 0.3) return "block";
    if (citation.uncited_count >= 1) return "warn";
    return "pass";
  })();
  const citationCheck: CheckResult = {
    name: "citation_coverage",
    status: citationStatus,
    summary:
      citation.total_claims === 0
        ? "No factual claims requiring citation detected."
        : `${citation.cited}/${citation.total_claims} factual claims cited` +
          (citation.uncited_count > 0 ? ` · ${citation.uncited_count} uncited` : "") +
          (citation.citation_needed_count > 0 ? ` · ${citation.citation_needed_count} flagged [CITATION_NEEDED]` : ""),
    detail: citation,
  };

  // ── 5b. Doorway / scaled-content detector (deterministic) ──
  // Blocks "swap-the-city-name" near-duplicate pages: too-similar body vs a
  // same-type sibling, or too few unique local entities. This is the May 2026
  // core-update doorway-abuse lever.
  const doorway = await checkDoorway(page.projectId, pageId, {
    pageSlug: page.pageSlug,
    title: page.title,
    pageType: page.pageType,
    bodyMarkdown: body,
  });
  const doorwayCheck: CheckResult = {
    name: "doorway",
    status: doorway.pass ? "pass" : "block",
    summary: doorway.pass
      ? `Max ${doorway.similarityPct}% similarity to siblings · ${doorway.uniqueLocalEntities} unique local entit${doorway.uniqueLocalEntities === 1 ? "y" : "ies"} — not a doorway. (Thresholds: <${Math.round(DOORWAY_SIMILARITY_THRESHOLD * 100)}% similar, ≥${DOORWAY_MIN_UNIQUE_ENTITIES} unique entities.)`
      : doorway.reasons.join(" "),
    detail: doorway,
  };

  const checks: CheckResult[] = [schemaCheck, eeatCheck, authCheck, structuralCheck, citationCheck, doorwayCheck];

  // ── 6. AI Overview citability (external — Claude call) ───────
  // ── 7. Accessibility (external — Playwright + axe) ──────────
  // ── 8. Originality (external — web_search via Claude) ───────
  if (!opts.skipExternal) {
    const client = opts.client ?? (await getLLMClient({ tier: "heavy" })).client;
    const model = opts.model ?? (await getLLMClient({ tier: "heavy" })).model;

    // AI Overview pass
    try {
      const jobInput = page.jobId
        ? ((await db().select().from(claudeJobs).where(eq(claudeJobs.id, page.jobId)).limit(1))[0]?.input ?? {})
        : {};
      const ji = jobInput as Record<string, unknown>;
      const ai: AiOverviewSuggestions = await suggestAiOverviewImprovements(client, {
        pageBodyMarkdown: body,
        metaTitle: page.metaTitle ?? page.title,
        metaDescription: page.metaDescription ?? "",
        targetKeyword: typeof ji.targetKeyword === "string" ? ji.targetKeyword : page.title,
        aiOverviewAngle: typeof ji.aiOverviewAngle === "string" ? ji.aiOverviewAngle : "",
        businessName: project.businessName,
        targetCity: project.city ?? "",
        model,
      });
      checks.push({
        name: "ai_overview_citability",
        status: ai.overall_grade === "weak" ? "warn" : "pass",
        summary: `Grade: ${ai.overall_grade}. ${ai.passages_to_bold.length} bold candidates · ${ai.factoids_to_add.length} factoids missing · ${ai.missing_faqs.length} FAQ gaps.`,
        detail: ai,
      });
    } catch (err) {
      checks.push({
        name: "ai_overview_citability",
        status: "warn",
        summary: `AI Overview pass failed: ${err instanceof Error ? err.message : String(err)}`,
        detail: { error: String(err) },
      });
    }

    // Accessibility — only if we have a live URL to point at
    if (opts.liveUrl) {
      try {
        const a11y: AccessibilityResult = await checkUrlAccessibility(opts.liveUrl, "desktop");
        const a11yStatus: CheckStatus =
          a11y.worst_impact === "critical" ? "block"
          : a11y.worst_impact === "serious" ? "warn"
          : "pass";
        checks.push({
          name: "accessibility",
          status: a11yStatus,
          summary: `${a11y.violations.length} violation(s) · worst impact ${a11y.worst_impact} · ${a11y.passes} rules passed`,
          detail: a11y,
        });
      } catch (err) {
        checks.push({
          name: "accessibility",
          status: "warn",
          summary: `Accessibility check failed: ${err instanceof Error ? err.message : String(err)}`,
          detail: { error: String(err) },
        });
      }
    }

    // Originality (web_search)
    try {
      const jobInput = page.jobId
        ? ((await db().select().from(claudeJobs).where(eq(claudeJobs.id, page.jobId)).limit(1))[0]?.input ?? {})
        : {};
      const ji = jobInput as Record<string, unknown>;
      const orig = await checkOriginality(client, model, {
        pageBody: body,
        targetKeyword: typeof ji.targetKeyword === "string" ? ji.targetKeyword : page.title,
        targetCity: project.city ?? "",
      });
      const origStatus: CheckStatus =
        orig.max_similarity >= ORIGINALITY_BLOCK_SIMILARITY ? "block"
        : orig.max_similarity >= 0.5 ? "warn"
        : "pass";
      checks.push({
        name: "originality",
        status: orig.error ? "warn" : origStatus,
        summary: orig.error
          ? `Originality check failed: ${orig.error}`
          : `Max similarity to top SERP results: ${Math.round(orig.max_similarity * 100)}% · verdict ${orig.verdict}. ${orig.competitor_summary}`,
        detail: orig,
      });
    } catch (err) {
      checks.push({
        name: "originality",
        status: "warn",
        summary: `Originality check failed: ${err instanceof Error ? err.message : String(err)}`,
        detail: { error: String(err) },
      });
    }
  }

  // ── Final verdict ───────────────────────────────────────────
  const block_count = checks.filter((c) => c.status === "block").length;
  const warn_count = checks.filter((c) => c.status === "warn").length;
  const pass_count = checks.filter((c) => c.status === "pass").length;
  const verdict: GauntletReport["verdict"] =
    block_count > 0 ? "block" : warn_count > 0 ? "pass_with_warnings" : "pass";

  // Top 3 fixes — pull from blocked + warn checks, prioritize blocks
  const ordered = [...checks].sort((a, b) => {
    const rank = (s: CheckStatus) => (s === "block" ? 0 : s === "warn" ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });
  const top_fixes = ordered
    .filter((c) => c.status !== "pass")
    .slice(0, 3)
    .map((c) => `[${c.status}] ${c.name}: ${c.summary}`);

  return {
    page_id: pageId,
    page_title: page.title,
    ran_at: new Date().toISOString(),
    verdict,
    block_count,
    warn_count,
    pass_count,
    checks,
    top_fixes,
  };
}
