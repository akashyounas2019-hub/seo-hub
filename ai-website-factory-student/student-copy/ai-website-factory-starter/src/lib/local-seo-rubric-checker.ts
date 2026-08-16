/**
 * Local SEO Rubric — deterministic checker.
 *
 * Runs every `mode: "deterministic"` check from the rubric against a
 * page's HTML / URL / meta, returning a structured finding list.
 *
 * What this does NOT do:
 *  - Subjective evaluation ("are the FAQs conversational?") — that goes
 *    to the LLM judge (`local-seo-rubric-judge.ts`)
 *  - Uniqueness-vs-siblings — that needs the corpus, handled by the
 *    runner script after all pages are loaded.
 *
 * Why no cheerio: keeping deps tight per project rules. The page HTML
 * is already crawled / available in HTML form; tight regex + minimal
 * DOM-lite parsing covers the structural checks we need.
 */

import {
  CHECKS,
  CORE_ENTITIES,
  HOMEPAGE_SECTIONS,
  IMAGE_NAME_BAD_RE,
  IMAGE_NAME_OK_RE,
  LOCATION_PAGE_SECTIONS,
  META_DESC_MAX,
  META_DESC_MIN,
  META_TITLE_MAX,
  META_TITLE_MIN,
  MIN_BODY_WORDS_PER_PAGE_TYPE,
  OPTIONAL_SCHEMA,
  REQUIRED_SCHEMA_BY_PAGE_TYPE,
  type RubricCategory,
  type RubricCheck,
  type RubricPageType,
  type SectionRequirement,
  SERVICE_PAGE_SECTIONS,
  BLOG_POST_SECTIONS,
  URL_MAX_LENGTH,
  checksForPageType,
  deterministicChecksForPageType,
  judgeChecksForPageType,
  maxScoreForPageType,
} from "./local-seo-rubric";

// ────────────────────────────────────────────────────────────────────
// Input + output types
// ────────────────────────────────────────────────────────────────────

export interface RubricPageInput {
  /** Live URL (or candidate URL) of the page. */
  url: string;
  /** Page type — caller can override the auto-inferred one. */
  pageType: RubricPageType;
  /** Primary keyword for the page (drives URL + meta + H1 checks). */
  primaryKeyword?: string;
  /** Location / city the page targets. */
  city?: string;
  /** Rendered HTML body — what an SEO crawler would see. */
  html: string;
  /** Meta title from <title> or RankMath rank_math_title. */
  metaTitle?: string;
  /** Meta description from <meta name="description">. */
  metaDescription?: string;
  /** Optional: extracted JSON-LD blocks (if caller already parsed them). */
  jsonLd?: Array<Record<string, unknown>>;
}

export type FindingStatus = "pass" | "fail" | "warn" | "needs_judge";

export interface RubricFinding {
  checkId: string;
  category: RubricCategory;
  status: FindingStatus;
  /** Severity for sort order — only relevant for fails/warns. */
  severity: "blocking" | "high" | "medium" | "low" | "info";
  weight: number;
  message: string;
  fixHint?: string;
  /** Optional: data the judge will need to evaluate, or that the UI surfaces. */
  evidence?: Record<string, unknown>;
}

export interface RubricCheckerResult {
  pageType: RubricPageType;
  /** Per-category sub-scores 0-100. */
  scores: Record<RubricCategory, number>;
  /** Weighted overall score 0-100. */
  overallScore: number;
  /** Findings ranked by severity → weight. */
  findings: RubricFinding[];
  /** Checks the deterministic pass couldn't decide — punted to LLM. */
  pendingJudge: RubricCheck[];
  /** Structured detection data exposed for the judge prompt. */
  evidence: {
    title: string;
    headings: Array<{ level: number; text: string }>;
    paragraphs: string[];
    schemaTypes: string[];
    internalLinks: number;
    externalLinks: number;
    imageCount: number;
    wordCount: number;
    sectionsDetected: string[];
    entitiesFound: string[];
  };
}

// ────────────────────────────────────────────────────────────────────
// Lightweight HTML parsing (no DOM dependency)
// ────────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(html: string): Array<{ level: number; text: string }> {
  const out: Array<{ level: number; text: string }> = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const level = parseInt(m[1], 10);
    const text = stripTags(m[2]).trim();
    if (text) out.push({ level, text });
  }
  return out;
}

function extractParagraphs(html: string): string[] {
  const out: string[] = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const t = stripTags(m[1]).trim();
    if (t.length > 20) out.push(t);
  }
  return out;
}

function extractJsonLd(html: string): { types: string[]; blocks: Record<string, unknown>[]; parseErrors: number } {
  const blocks: Record<string, unknown>[] = [];
  const types: string[] = [];
  let parseErrors = 0;
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ? (parsed["@graph"] as unknown[]) : [parsed];
      for (const item of items) {
        if (item && typeof item === "object") {
          blocks.push(item as Record<string, unknown>);
          const t = (item as Record<string, unknown>)["@type"];
          if (typeof t === "string") types.push(t);
          else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") types.push(x);
        }
      }
    } catch {
      parseErrors++;
    }
  }
  return { types, blocks, parseErrors };
}

function extractLinks(html: string, ownHost: string | null): { internal: string[]; external: string[] } {
  const internal: string[] = [];
  const external: string[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].trim();
    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (href.startsWith("/")) {
      internal.push(href);
      continue;
    }
    try {
      const u = new URL(href);
      if (ownHost && u.host.replace(/^www\./, "") === ownHost.replace(/^www\./, "")) {
        internal.push(href);
      } else {
        external.push(href);
      }
    } catch {
      // relative — assume internal
      internal.push(href);
    }
  }
  return { internal, external };
}

function extractImages(html: string): Array<{ src: string; alt: string }> {
  const out: Array<{ src: string; alt: string }> = [];
  const re = /<img\s+([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = (attrs.match(/src=["']([^"']+)["']/i) ?? [])[1] ?? "";
    const alt = (attrs.match(/alt=["']([^"']*)["']/i) ?? [])[1] ?? "";
    if (src) out.push({ src, alt });
  }
  return out;
}

function detectSection(html: string, headings: Array<{ level: number; text: string }>, sec: SectionRequirement): boolean {
  // 1. Heading match
  if (sec.headingPatterns) {
    for (const re of sec.headingPatterns) {
      for (const h of headings) {
        if (h.level <= 4 && re.test(h.text)) return true;
      }
    }
  }
  // 2. Selector-class hit (lightweight — class= or data-section=)
  if (sec.selectors) {
    for (const sel of sec.selectors) {
      // turn `.foo` into class regex; `[data-section=hero]` into attr regex
      if (sel.startsWith(".")) {
        const cls = sel.slice(1);
        const re = new RegExp(`class=["'][^"']*\\b${cls.replace(/-/g, "\\-")}\\b[^"']*["']`, "i");
        if (re.test(html)) return true;
      } else if (sel.startsWith("[")) {
        const re = new RegExp(sel.replace(/^\[/, "").replace(/\]$/, "").replace(/=/, "=[\"']?"), "i");
        if (re.test(html)) return true;
      } else if (sel.includes(" ")) {
        const last = sel.split(" ").pop()!;
        const re = new RegExp(`<${last.replace(/[^a-z0-9]/gi, "")}`, "i");
        if (re.test(html)) return true;
      }
    }
  }
  // 3. Content signal
  if (sec.contentSignals) {
    const text = stripTags(html);
    for (const re of sec.contentSignals) {
      if (re.test(text)) return true;
    }
  }
  return false;
}

function sectionsForPageType(pageType: RubricPageType): SectionRequirement[] {
  switch (pageType) {
    case "homepage": return HOMEPAGE_SECTIONS;
    case "service": return SERVICE_PAGE_SECTIONS;
    case "location": return LOCATION_PAGE_SECTIONS;
    case "blog": return BLOG_POST_SECTIONS;
    default: return [];
  }
}

function severityFromWeight(weight: number): RubricFinding["severity"] {
  if (weight >= 8) return "blocking";
  if (weight >= 6) return "high";
  if (weight >= 4) return "medium";
  if (weight >= 2) return "low";
  return "info";
}

// ────────────────────────────────────────────────────────────────────
// Main checker
// ────────────────────────────────────────────────────────────────────

export function checkRubric(input: RubricPageInput): RubricCheckerResult {
  const html = input.html ?? "";
  const text = stripTags(html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const headings = extractHeadings(html);
  const paragraphs = extractParagraphs(html);
  const { types: schemaTypes, parseErrors } = extractJsonLd(html);
  let ownHost: string | null = null;
  try { ownHost = new URL(input.url).host; } catch { /* relative url */ }
  const { internal: internalLinks, external: externalLinks } = extractLinks(html, ownHost);
  const images = extractImages(html);

  // Section detection
  const sectionsDetected: string[] = [];
  for (const sec of sectionsForPageType(input.pageType)) {
    if (detectSection(html, headings, sec)) sectionsDetected.push(sec.id);
  }

  // Entity coverage
  const entitiesFound: string[] = [];
  const lcText = text.toLowerCase();
  for (const bucket of Object.values(CORE_ENTITIES)) {
    for (const ent of bucket) {
      if (lcText.includes(ent.toLowerCase())) entitiesFound.push(ent);
    }
  }

  const evidence = {
    title: input.metaTitle ?? (headings.find((h) => h.level === 1)?.text ?? ""),
    headings,
    paragraphs,
    schemaTypes,
    internalLinks: internalLinks.length,
    externalLinks: externalLinks.length,
    imageCount: images.length,
    wordCount,
    sectionsDetected,
    entitiesFound,
  };

  // ── Run deterministic checks ────────────────────────────────────
  const findings: RubricFinding[] = [];
  const pending: RubricCheck[] = [];

  const deterministic = deterministicChecksForPageType(input.pageType);
  for (const check of deterministic) {
    const result = runDeterministicCheck(check, input, {
      html, text, wordCount, headings, paragraphs, schemaTypes, parseErrors,
      internalLinks, externalLinks, images, sectionsDetected, entitiesFound,
    });
    findings.push(result);
  }

  // Queue judge checks (they fire in the LLM pass)
  for (const check of judgeChecksForPageType(input.pageType)) {
    pending.push(check);
    findings.push({
      checkId: check.id,
      category: check.category,
      status: "needs_judge",
      severity: severityFromWeight(check.weight),
      weight: check.weight,
      message: `Pending LLM judge: ${check.description}`,
      fixHint: check.fixHint,
    });
  }

  // ── Score breakdown ─────────────────────────────────────────────
  const scores = computeScores(findings, input.pageType);
  const overallScore = computeOverall(findings, input.pageType);

  // Sort findings: blocking → high → medium → low → info → pass at end
  const orderRank: Record<RubricFinding["severity"], number> = { blocking: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort((a, b) => {
    if (a.status !== b.status) {
      const stat: Record<FindingStatus, number> = { fail: 0, warn: 1, needs_judge: 2, pass: 3 };
      return stat[a.status] - stat[b.status];
    }
    return orderRank[a.severity] - orderRank[b.severity];
  });

  return {
    pageType: input.pageType,
    scores,
    overallScore,
    findings,
    pendingJudge: pending,
    evidence,
  };
}

// ────────────────────────────────────────────────────────────────────
// Per-check implementations
// ────────────────────────────────────────────────────────────────────

interface RunCtx {
  html: string;
  text: string;
  wordCount: number;
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  schemaTypes: string[];
  parseErrors: number;
  internalLinks: string[];
  externalLinks: string[];
  images: Array<{ src: string; alt: string }>;
  sectionsDetected: string[];
  entitiesFound: string[];
}

function runDeterministicCheck(check: RubricCheck, input: RubricPageInput, ctx: RunCtx): RubricFinding {
  const sev = severityFromWeight(check.weight);
  const base = {
    checkId: check.id,
    category: check.category,
    severity: sev,
    weight: check.weight,
    fixHint: check.fixHint,
  };

  // URL checks
  if (check.id === "url_short") {
    const path = pathFromUrl(input.url);
    const len = path.length;
    if (len <= URL_MAX_LENGTH) return { ...base, status: "pass", message: `URL ${len} chars (OK)` };
    return { ...base, status: "fail", message: `URL is ${len} chars (max ${URL_MAX_LENGTH})`, evidence: { length: len, path } };
  }
  if (check.id === "url_keyword") {
    if (!input.primaryKeyword) return { ...base, status: "warn", message: "No primary keyword set — can't check URL match" };
    const slug = slugify(input.primaryKeyword);
    const path = pathFromUrl(input.url).toLowerCase();
    const slugWords = slug.split("-").filter((w) => w.length > 2);
    const matched = slugWords.filter((w) => path.includes(w)).length;
    if (matched >= Math.max(1, slugWords.length - 1)) {
      return { ...base, status: "pass", message: `URL contains keyword (${matched}/${slugWords.length} tokens)` };
    }
    return { ...base, status: "fail", message: `URL missing primary keyword "${input.primaryKeyword}"`, evidence: { matched, total: slugWords.length, path } };
  }
  if (check.id === "url_lowercase_kebab") {
    const path = pathFromUrl(input.url);
    if (/[A-Z_]/.test(path)) return { ...base, status: "fail", message: "URL contains uppercase or underscore", evidence: { path } };
    return { ...base, status: "pass", message: "URL is kebab-case" };
  }

  // Meta title
  if (check.id === "meta_title_present") {
    if (input.metaTitle && input.metaTitle.trim().length > 0) return { ...base, status: "pass", message: "Meta title present" };
    return { ...base, status: "fail", message: "Meta title missing" };
  }
  if (check.id === "meta_title_length") {
    const t = input.metaTitle ?? "";
    const len = t.length;
    if (len === 0) return { ...base, status: "fail", message: "Meta title missing" };
    if (len >= META_TITLE_MIN && len <= META_TITLE_MAX) {
      return { ...base, status: "pass", message: `Meta title ${len} chars` };
    }
    return { ...base, status: "warn", message: `Meta title ${len} chars — outside ${META_TITLE_MIN}-${META_TITLE_MAX} window`, evidence: { length: len, title: t } };
  }
  if (check.id === "meta_title_keyword") {
    if (!input.primaryKeyword) return { ...base, status: "warn", message: "No primary keyword set" };
    const lcKw = input.primaryKeyword.toLowerCase();
    if ((input.metaTitle ?? "").toLowerCase().includes(lcKw)) return { ...base, status: "pass", message: `Meta title contains "${input.primaryKeyword}"` };
    return { ...base, status: "fail", message: `Meta title missing primary keyword "${input.primaryKeyword}"`, evidence: { title: input.metaTitle ?? "" } };
  }
  if (check.id === "meta_title_location") {
    if (!input.city) return { ...base, status: "warn", message: "No city set — can't check meta title localization" };
    if ((input.metaTitle ?? "").toLowerCase().includes(input.city.toLowerCase())) return { ...base, status: "pass", message: `Meta title contains "${input.city}"` };
    return { ...base, status: "fail", message: `Meta title missing city "${input.city}"`, evidence: { title: input.metaTitle ?? "" } };
  }

  // Meta description
  if (check.id === "meta_desc_present") {
    if (input.metaDescription && input.metaDescription.trim().length > 0) return { ...base, status: "pass", message: "Meta description present" };
    return { ...base, status: "fail", message: "Meta description missing" };
  }
  if (check.id === "meta_desc_length") {
    const d = input.metaDescription ?? "";
    const len = d.length;
    if (len === 0) return { ...base, status: "fail", message: "Meta description missing" };
    if (len >= META_DESC_MIN && len <= META_DESC_MAX) return { ...base, status: "pass", message: `Meta description ${len} chars` };
    return { ...base, status: "warn", message: `Meta description ${len} chars — outside ${META_DESC_MIN}-${META_DESC_MAX} window`, evidence: { length: len } };
  }
  if (check.id === "meta_desc_cta") {
    const d = (input.metaDescription ?? "").toLowerCase();
    const ctaRe = /\b(?:call|book|contact|get\s+(?:a\s+)?(?:free\s+)?(?:quote|estimate)|reserve|schedule|request|order|sign\s+up|learn\s+more|today|now)\b/;
    if (ctaRe.test(d)) return { ...base, status: "pass", message: "Meta description ends with a CTA" };
    return { ...base, status: "warn", message: "Meta description has no clear CTA", evidence: { meta_description: d } };
  }

  // Headings
  if (check.id === "h1_exactly_one") {
    const h1s = ctx.headings.filter((h) => h.level === 1).length;
    if (h1s === 1) return { ...base, status: "pass", message: "Exactly one H1" };
    if (h1s === 0) return { ...base, status: "fail", message: "No H1 found" };
    return { ...base, status: "fail", message: `${h1s} H1s on the page — demote secondary to H2` };
  }
  if (check.id === "h1_has_primary") {
    if (!input.primaryKeyword) return { ...base, status: "warn", message: "No primary keyword set" };
    const h1 = ctx.headings.find((h) => h.level === 1);
    if (!h1) return { ...base, status: "fail", message: "No H1 to check" };
    if (h1.text.toLowerCase().includes(input.primaryKeyword.toLowerCase())) return { ...base, status: "pass", message: "H1 contains primary keyword" };
    return { ...base, status: "fail", message: `H1 missing primary keyword "${input.primaryKeyword}"`, evidence: { h1: h1.text } };
  }
  if (check.id === "heading_hierarchy") {
    let last = 0;
    for (const h of ctx.headings) {
      if (last > 0 && h.level > last + 1) {
        return { ...base, status: "warn", message: `Heading jumps from H${last} to H${h.level}`, evidence: { jump: { from: last, to: h.level, text: h.text } } };
      }
      last = h.level;
    }
    return { ...base, status: "pass", message: "Heading hierarchy is clean" };
  }

  // HTTPS
  if (check.id === "https") {
    try {
      const u = new URL(input.url);
      if (u.protocol === "https:") return { ...base, status: "pass", message: "Served over HTTPS" };
      return { ...base, status: "fail", message: `URL uses ${u.protocol} — must be https`, severity: "blocking" };
    } catch {
      return { ...base, status: "warn", message: "Couldn't parse URL to check protocol" };
    }
  }

  // Images
  if (check.id === "image_alt_text") {
    if (ctx.images.length === 0) return { ...base, status: "pass", message: "No images on page" };
    const missing = ctx.images.filter((i) => !i.alt || i.alt.trim().length < 3).length;
    if (missing === 0) return { ...base, status: "pass", message: `All ${ctx.images.length} images have alt text` };
    return { ...base, status: "fail", message: `${missing} of ${ctx.images.length} images missing/short alt text`, evidence: { missing } };
  }
  if (check.id === "image_named_well") {
    if (ctx.images.length === 0) return { ...base, status: "pass", message: "No images on page" };
    let bad = 0;
    for (const img of ctx.images) {
      const filename = img.src.split("/").pop()?.split("?")[0] ?? "";
      if (IMAGE_NAME_BAD_RE.test(filename)) bad++;
      else if (!IMAGE_NAME_OK_RE.test(filename)) bad++;
    }
    if (bad === 0) return { ...base, status: "pass", message: `All ${ctx.images.length} images named descriptively` };
    return { ...base, status: "warn", message: `${bad} of ${ctx.images.length} images poorly named (DSC1234.jpg etc.)`, evidence: { bad } };
  }

  // Schema
  if (check.id === "schema_required_present") {
    const required = REQUIRED_SCHEMA_BY_PAGE_TYPE[input.pageType];
    if (required.length === 0) return { ...base, status: "pass", message: "No required schema for this page type" };
    const present = required.filter((t) => ctx.schemaTypes.includes(t));
    if (present.length === required.length) return { ...base, status: "pass", message: `All ${required.length} required schema types present` };
    const missing = required.filter((t) => !ctx.schemaTypes.includes(t));
    return { ...base, status: "fail", message: `Missing schema: ${missing.join(", ")}`, evidence: { missing, found: ctx.schemaTypes } };
  }
  if (check.id === "schema_valid_json") {
    if (ctx.parseErrors === 0) return { ...base, status: "pass", message: "All JSON-LD blocks parse" };
    return { ...base, status: "fail", message: `${ctx.parseErrors} JSON-LD block(s) failed to parse — Google will silently ignore them`, evidence: { errors: ctx.parseErrors } };
  }
  if (check.id === "schema_has_url") {
    if (ctx.schemaTypes.length === 0) return { ...base, status: "warn", message: "No schema to check" };
    // Look for "url" key in the html (very lightweight check)
    const hasUrl = /\"url\"\s*:\s*\"https?:\/\//.test(ctx.html);
    if (hasUrl) return { ...base, status: "pass", message: "Schema includes URL" };
    return { ...base, status: "warn", message: "Schema blocks don't include url/name fields" };
  }

  // Internal linking
  if (check.id === "internal_links_present") {
    if (ctx.internalLinks.length >= 3) return { ...base, status: "pass", message: `${ctx.internalLinks.length} internal links` };
    return { ...base, status: "fail", message: `Only ${ctx.internalLinks.length} internal links — add 3+`, evidence: { count: ctx.internalLinks.length } };
  }
  if (check.id === "service_to_location_link") {
    const hits = ctx.internalLinks.filter((href) => /\/(?:location|area|city|cities|locations)\//i.test(href)).length;
    // Also check for likely city-page paths (single-segment slug containing common city tokens)
    const cityHits = ctx.internalLinks.filter((href) => /\/(?:toronto|mississauga|vaughan|markham|niagara|oakville|burlington|dubai|manchester|salford|stockport|hamilton)\b/i.test(href)).length;
    if (hits + cityHits >= 1) return { ...base, status: "pass", message: "Service page links to location page(s)" };
    return { ...base, status: "fail", message: "Service page has no link to any location/city page" };
  }
  if (check.id === "location_to_service_link") {
    const hits = ctx.internalLinks.filter((href) => /\/(?:service|services)\//i.test(href) || /\/(?:airport|wedding|hourly|corporate|prom|wine|graduation|funeral)/i.test(href)).length;
    if (hits >= 1) return { ...base, status: "pass", message: "Location page links to service page(s)" };
    return { ...base, status: "fail", message: "Location page has no link to any service page" };
  }
  if (check.id === "outbound_authority") {
    const authorityHosts = /(?:\.gov|\.ca|\.uk|\.edu|nasa|cdc\.gov|who\.int|statcan|wikipedia\.org|nytimes\.com|reuters|nature\.com|sciencedirect)/i;
    const hit = ctx.externalLinks.find((h) => authorityHosts.test(h));
    if (hit) return { ...base, status: "pass", message: "Has authority outbound link", evidence: { sample: hit } };
    return { ...base, status: "warn", message: "No authority outbound links found" };
  }

  // Semantic + anti-doorway
  if (check.id === "semantic_entity_coverage") {
    if (ctx.entitiesFound.length >= 6) return { ...base, status: "pass", message: `${ctx.entitiesFound.length} entities mentioned` };
    return { ...base, status: "warn", message: `Only ${ctx.entitiesFound.length} entities found — content is shallow`, evidence: { found: ctx.entitiesFound } };
  }
  if (check.id === "body_word_count") {
    const min = MIN_BODY_WORDS_PER_PAGE_TYPE[input.pageType] ?? 200;
    if (ctx.wordCount >= min) return { ...base, status: "pass", message: `${ctx.wordCount} words (min ${min})` };
    return { ...base, status: "fail", message: `Only ${ctx.wordCount} words (need ${min}+)`, evidence: { wordCount: ctx.wordCount, min } };
  }
  if (check.id === "uniqueness_vs_siblings") {
    // Deferred to the runner — needs sibling corpus. We mark as warn for now.
    return { ...base, status: "warn", message: "Uniqueness check pending — runner needs the full site corpus", severity: "low" };
  }

  // Structure section checks (deterministic ones)
  for (const sec of [...HOMEPAGE_SECTIONS, ...SERVICE_PAGE_SECTIONS, ...LOCATION_PAGE_SECTIONS, ...BLOG_POST_SECTIONS]) {
    const sectionCheckId = check.id;
    // Map check.id back to section ids — we wired them 1:1 in the rubric
    if (sectionCheckId === `homepage_${sec.id}` || sectionCheckId === `service_${sec.id}` ||
        sectionCheckId === `location_${sec.id}` || sectionCheckId.startsWith(`blog_${sec.id}`)) {
      if (ctx.sectionsDetected.includes(sec.id)) {
        return { ...base, status: "pass", message: `${sec.label} — present` };
      }
      return { ...base, status: "fail", message: `${sec.label} — NOT detected`, fixHint: check.fixHint ?? `Add a section: ${sec.label}. ${sec.rationale}` };
    }
  }

  // Fallback — shouldn't happen
  return { ...base, status: "warn", message: `Check "${check.id}" has no implementation`, severity: "info" };
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function pathFromUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // already relative
    return url.startsWith("/") ? url : "/" + url;
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function computeScores(findings: RubricFinding[], pageType: RubricPageType): Record<RubricCategory, number> {
  const out: Record<RubricCategory, number> = {
    on_page: 100, structure: 100, eeat: 100, local_proof: 100, schema: 100,
    internal_linking: 100, semantic: 100, anti_doorway: 100,
  };
  // For each category, sum weights of all checks and weights of pass+needs_judge findings.
  const checks = checksForPageType(pageType);
  const byCategory: Record<string, { total: number; awarded: number }> = {};
  for (const c of checks) {
    byCategory[c.category] = byCategory[c.category] ?? { total: 0, awarded: 0 };
    byCategory[c.category].total += c.weight;
  }
  for (const f of findings) {
    if (!byCategory[f.category]) continue;
    if (f.status === "pass") byCategory[f.category].awarded += f.weight;
    else if (f.status === "needs_judge") byCategory[f.category].awarded += f.weight * 0.5; // partial until judge weighs in
    else if (f.status === "warn") byCategory[f.category].awarded += f.weight * 0.5;
  }
  for (const cat of Object.keys(byCategory)) {
    const { total, awarded } = byCategory[cat];
    if (total === 0) continue;
    out[cat as RubricCategory] = Math.round((awarded / total) * 100);
  }
  return out;
}

function computeOverall(findings: RubricFinding[], pageType: RubricPageType): number {
  const max = maxScoreForPageType(pageType);
  if (max === 0) return 0;
  let awarded = 0;
  for (const f of findings) {
    if (f.status === "pass") awarded += f.weight;
    else if (f.status === "needs_judge") awarded += f.weight * 0.5;
    else if (f.status === "warn") awarded += f.weight * 0.5;
  }
  return Math.round((awarded / max) * 100);
}
