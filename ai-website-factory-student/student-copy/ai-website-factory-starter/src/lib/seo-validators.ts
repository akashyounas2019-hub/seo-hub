/**
 * V1 — Format & sanity validators.
 *
 * Cheap, deterministic, no LLM cost. Every agent proposal flows through
 * the validator for its kind before being written to seo_proposals.
 * Failed validations get logged to seo_validation_failures so we can
 * watch the agent's mistake patterns over time.
 *
 * The contract is identical for every validator:
 *   { ok: boolean, errors: string[], warnings: string[] }
 *
 * - errors  → fatal, proposal is dropped
 * - warnings → recorded but proposal continues (yellow-flag for review)
 */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Empty pass — no issues. */
const PASS: ValidationResult = Object.freeze({ ok: true, errors: [], warnings: [] });

function fail(errors: string[], warnings: string[] = []): ValidationResult {
  return { ok: false, errors, warnings };
}
function warn(warnings: string[]): ValidationResult {
  return { ok: true, errors: [], warnings };
}

// ─── Alt text ────────────────────────────────────────────────────────

export function validateAltText(input: {
  alt: string;
  imageUrl: string;
  pageTitle: string;
  nearbyText: string;
}): ValidationResult {
  const errs: string[] = [];
  const warns: string[] = [];
  const alt = input.alt.trim();

  if (!alt) errs.push("alt is empty");
  if (alt.length > 125) errs.push(`alt is ${alt.length} chars, exceeds 125`);
  if (alt.length < 4 && alt.length > 0) errs.push(`alt is ${alt.length} chars — too short to be useful`);
  if (/^(image of|picture of|photo of|graphic of)/i.test(alt)) {
    errs.push("alt starts with 'image/picture/photo of' — banned pattern");
  }
  // The alt should contain at least one noun-like token from the page
  // title or nearby text. If we share no words, the model probably
  // hallucinated.
  if (alt && input.pageTitle) {
    const altWords = wordSet(alt);
    const contextWords = wordSet(input.pageTitle + " " + input.nearbyText);
    const shared = [...altWords].filter((w) => contextWords.has(w));
    if (shared.length === 0 && altWords.size > 2) {
      warns.push("no shared content words with page title or surrounding text — possible hallucination");
    }
  }
  // Soft check — keyword stuffing.
  if (alt) {
    const counts = new Map<string, number>();
    for (const w of alt.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      if (w.length < 4) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    for (const [w, n] of counts) {
      if (n >= 3) {
        warns.push(`"${w}" appears ${n} times — possible keyword stuffing`);
        break;
      }
    }
  }
  return errs.length > 0 ? fail(errs, warns) : warns.length > 0 ? warn(warns) : PASS;
}

// ─── Meta title ──────────────────────────────────────────────────────

export function validateMetaTitle(input: { title: string; existingTitle: string }): ValidationResult {
  const errs: string[] = [];
  const warns: string[] = [];
  const t = input.title.trim();
  if (!t) errs.push("title is empty");
  if (t.length > 65) errs.push(`title is ${t.length} chars — over the 60-char SERP limit`);
  if (t.length < 25) warns.push(`title is ${t.length} chars — under 30 is suboptimal`);
  if (/^\s|\s$/.test(input.title)) warns.push("leading or trailing whitespace");
  if (/[<>"]/.test(t)) errs.push("contains <, >, or unescaped quote");
  if (t === input.existingTitle.trim()) errs.push("proposed title is identical to existing — no change");
  // Check for banned filler.
  for (const filler of ["welcome to", "homepage", "untitled"]) {
    if (t.toLowerCase().startsWith(filler)) {
      warns.push(`title starts with "${filler}" — low SERP CTR pattern`);
    }
  }
  return errs.length > 0 ? fail(errs, warns) : warns.length > 0 ? warn(warns) : PASS;
}

// ─── Meta description ────────────────────────────────────────────────

export function validateMetaDescription(input: { description: string }): ValidationResult {
  const errs: string[] = [];
  const warns: string[] = [];
  const d = input.description.trim();
  if (!d) errs.push("description is empty");
  if (d.length > 170) errs.push(`description is ${d.length} chars — over 170 SERP limit`);
  if (d.length < 80) warns.push(`description is ${d.length} chars — under 80 wastes the SERP real estate`);
  if (/[<>"]/.test(d)) errs.push("contains <, >, or unescaped quote");
  // Should end with a CTA-like verb cluster.
  if (d && !/(call|book|get|reserve|contact|learn|see|view|order|hire|request|start)\b[^.]*[.!]?$/i.test(d)) {
    warns.push("doesn't end with a CTA verb — likely under-optimized for CTR");
  }
  return errs.length > 0 ? fail(errs, warns) : warns.length > 0 ? warn(warns) : PASS;
}

// ─── Schema (JSON-LD) ────────────────────────────────────────────────

export function validateSchema(input: { schemaType: string; jsonLd: string }): ValidationResult {
  const errs: string[] = [];
  const warns: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.jsonLd);
  } catch (e) {
    return fail([`json-ld is not valid JSON: ${e instanceof Error ? e.message : String(e)}`]);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail(["json-ld root must be a JSON object"]);
  }
  const obj = parsed as Record<string, unknown>;
  if (obj["@context"] !== "https://schema.org") {
    errs.push(`@context must be "https://schema.org", got ${JSON.stringify(obj["@context"])}`);
  }
  const t = obj["@type"];
  if (!t) errs.push("@type is missing");
  else if (typeof t === "string" && t !== input.schemaType) {
    warns.push(`@type "${t}" doesn't match declared kind "${input.schemaType}"`);
  }

  // Type-specific required fields.
  const required = REQUIRED_FIELDS_BY_TYPE[input.schemaType] ?? [];
  for (const field of required) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === "") {
      errs.push(`required field "${field}" missing for ${input.schemaType}`);
    }
  }

  // Size cap.
  if (input.jsonLd.length > 12000) errs.push(`json-ld is ${input.jsonLd.length} bytes — over 12 KB cap`);

  // URL fields should look like URLs.
  for (const key of ["url", "image", "logo", "sameAs", "@id"]) {
    const v = obj[key];
    const values = Array.isArray(v) ? v : v !== undefined ? [v] : [];
    for (const candidate of values) {
      if (typeof candidate === "string" && candidate && !/^https?:\/\//.test(candidate) && !candidate.startsWith("#")) {
        errs.push(`${key} value "${candidate.slice(0, 40)}" is not an absolute URL`);
      }
    }
  }
  return errs.length > 0 ? fail(errs, warns) : warns.length > 0 ? warn(warns) : PASS;
}

const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  LocalBusiness: ["name", "address", "telephone"],
  LimousineService: ["name", "address", "telephone"],
  TaxiService: ["name", "address", "telephone"],
  Service: ["name", "provider"],
  Article: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  FAQPage: ["mainEntity"],
  BreadcrumbList: ["itemListElement"],
  Organization: ["name", "url"],
  ContactPage: ["name"],
  AboutPage: ["name"],
};

// ─── URL resolution check (async) ────────────────────────────────────

export async function validateUrlResolves(url: string): Promise<ValidationResult> {
  if (!url) return fail(["empty url"]);
  if (!/^https?:\/\//.test(url)) return fail([`not an absolute url: ${url.slice(0, 60)}`]);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status >= 200 && res.status < 400) return PASS;
    if (res.status === 405) {
      // HEAD not allowed — fall back to GET with no-body read.
      const g = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8_000) });
      if (g.status >= 200 && g.status < 400) return PASS;
      return fail([`url returned ${g.status}`]);
    }
    return fail([`url returned ${res.status}`]);
  } catch (err) {
    return fail([`url fetch failed: ${err instanceof Error ? err.message : String(err)}`]);
  }
}

// ─── Brand voice (banned-word lint) ──────────────────────────────────

/**
 * Reads the site's brand_voice field (free-form admin notes) and looks
 * for "never use ..." / "we say ... not ..." patterns. Then checks the
 * proposed text against them.
 *
 * Conservative — only fires when the brand notes explicitly call out a
 * word. We don't apply generic style rules here (that's the critic's job).
 */
export function validateBrandVoice(input: {
  text: string;
  brandVoice: string | null | undefined;
}): ValidationResult {
  if (!input.brandVoice) return PASS;
  const errs: string[] = [];
  const warns: string[] = [];
  const text = input.text.toLowerCase();
  const notes = input.brandVoice.toLowerCase();

  // Pattern: 'never use "X"' or 'never use X' or 'no X'.
  for (const m of notes.matchAll(/(?:never|don'?t|do not|avoid|ban[ned]*)[\s\w]*?["'`]?([a-z][a-z\-']{2,})/gi)) {
    const banned = m[1].trim();
    if (banned && new RegExp(`\\b${escapeRe(banned)}\\b`, "i").test(text)) {
      warns.push(`brand voice forbids "${banned}" — found in proposal`);
    }
  }
  // Pattern: 'we say X not Y' / 'use X instead of Y'.
  for (const m of notes.matchAll(/(?:we say|use)\s+["'`]?([a-z\-']+)["'`]?[\s\w]*?(?:not|instead of)\s+["'`]?([a-z\-']+)/gi)) {
    const replacement = m[1];
    const forbidden = m[2];
    if (forbidden && new RegExp(`\\b${escapeRe(forbidden)}\\b`, "i").test(text)) {
      warns.push(`brand voice prefers "${replacement}" over "${forbidden}" — found "${forbidden}"`);
    }
  }
  return warns.length > 0 ? warn(warns) : PASS;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function wordSet(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  );
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
