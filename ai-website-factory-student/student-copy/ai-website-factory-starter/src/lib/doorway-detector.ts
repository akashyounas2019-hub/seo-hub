/**
 * Doorway / scaled-content-abuse detector (deterministic, dependency-free).
 *
 * Google's scaled-content-abuse + doorway-abuse policy (enforced hard by the
 * May 2026 core update) punishes "swap-the-city-name" pages: a fleet of
 * near-identical pages where only the city/landmark tokens change. This module
 * catches those before they publish.
 *
 * Two independent signals, BOTH deterministic and pure:
 *
 *   1. Body similarity — trigram (3-shingle) Jaccard similarity between this
 *      page's body and EACH sibling. We report the MAX overlap across all
 *      siblings. A page that is ≥ DOORWAY_SIMILARITY_THRESHOLD (default 80%)
 *      similar to ANY sibling is a doorway.
 *
 *   2. Unique local entities — the count of local-specific proper nouns this
 *      page contains that NONE of its siblings do (city names, neighbourhoods,
 *      roads, venues, airport codes). A genuinely-local page names places its
 *      siblings don't. Fewer than DOORWAY_MIN_UNIQUE_ENTITIES (default 3)
 *      distinct unique local entities = the page isn't actually localized, it's
 *      a template with the same handful of tokens swapped.
 *
 * The function FAILS (pass=false) if EITHER signal trips. It is pure — no
 * network, no LLM, no DB — so it is trivially testable and deterministic.
 */

// ────────── Threshold constants ──────────

/** Max body trigram-Jaccard overlap with any sibling. ≥ this = doorway. */
export const DOORWAY_SIMILARITY_THRESHOLD = 0.8; // 80%
/** Minimum distinct local entities this page has that siblings don't. */
export const DOORWAY_MIN_UNIQUE_ENTITIES = 3;
/** Shingle size for the Jaccard similarity (word trigrams). */
export const DOORWAY_SHINGLE_SIZE = 3;

// ────────── Public types ──────────

export interface DoorwayPage {
  slug: string;
  title: string;
  bodyText: string;
}

export interface DoorwayOptions {
  /** Override the body-similarity fail threshold (0..1). */
  similarityThreshold?: number;
  /** Override the minimum-unique-local-entities fail threshold. */
  minUniqueEntities?: number;
  /** Override the word-shingle size. */
  shingleSize?: number;
}

export interface DoorwayResult {
  pass: boolean;
  /** Max similarity to any sibling, as a 0-100 percentage (rounded). */
  similarityPct: number;
  /** Slug of the most-similar sibling (the worst offender), if any. */
  worstSibling?: string;
  /** Count of distinct local entities present here but in NO sibling. */
  uniqueLocalEntities: number;
  /** Human-readable failure reasons (empty when pass=true). */
  reasons: string[];
}

// ────────── Text normalization + shingling ──────────

/** Lowercase, strip markdown/punctuation, collapse whitespace → word array. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Drop markdown link URLs + image syntax so boilerplate links don't skew similarity.
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Build the set of word n-gram shingles for a token array. */
function shingleSet(tokens: string[], size: number): Set<string> {
  const set = new Set<string>();
  if (tokens.length < size) {
    // Too short to form a full shingle — fall back to the single joined token
    // so two tiny identical bodies still register as similar.
    if (tokens.length > 0) set.add(tokens.join(" "));
    return set;
  }
  for (let i = 0; i + size <= tokens.length; i++) {
    set.add(tokens.slice(i, i + size).join(" "));
  }
  return set;
}

/** Jaccard similarity of two sets: |A ∩ B| / |A ∪ B|. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  // Iterate the smaller set for speed.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ────────── Local-entity extraction ──────────

/**
 * Known fixed-pattern local tokens that are unambiguously place-specific:
 *   - Airport codes (3 uppercase letters in a curated set, plus a generic
 *     "[A-Z]{3} Airport"/"[A-Z]{3} International" fallback).
 *   - Road / street / venue suffixes attached to a proper noun.
 * Combined with multiword capitalized proper nouns, this is a reasonable
 * heuristic for "local entities" without any gazetteer dependency.
 */
const AIRPORT_CODES =
  /\b(?:DXB|DWC|AUH|SHJ|RKT|FJR|AAN|JFK|LGA|EWR|LAX|ORD|SFO|MIA|ATL|DFW|SEA|DEN|BOS|IAD|DCA|LHR|LGW)\b/g;

/** Place suffix words that mark the preceding capitalized word(s) as a venue/road. */
const PLACE_SUFFIX =
  "(?:Airport|International|Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Highway|Hwy|Lane|Square|Park|Plaza|Centre|Center|Mall|Stadium|Arena|Hotel|Resort|Casino|Falls|Bridge|Harbour|Harbor|Station|Terminal|Beach|Lake|Bay|Heights|Hills|Village|Junction|Crossing|Gardens|Estate|Winery|Vineyard|Manor)";

/**
 * Extract a normalized set of local entities from a page body.
 *
 * Heuristics (deterministic):
 *   - Multiword capitalized proper nouns: "Palm Jumeirah", "Emirates Hills",
 *     "Sheikh Zayed Road", "Business Bay".
 *   - A capitalized word followed by a place-suffix: "Jumeirah Beach", "Al Barsha Mall".
 *   - Curated + generic airport codes.
 *
 * Entities are lowercased + whitespace-normalized so "Palm  Jumeirah" and
 * "palm jumeirah" collapse to the same key. Returns a Set.
 */
export function extractLocalEntities(body: string): Set<string> {
  const entities = new Set<string>();
  if (!body) return entities;

  // 1. Airport codes (curated + generic "ABC Airport").
  for (const m of body.match(AIRPORT_CODES) ?? []) entities.add(m.toLowerCase());
  for (const m of body.match(/\b[A-Z]{3}\b(?=\s+(?:Airport|International))/g) ?? []) {
    entities.add(m.toLowerCase());
  }

  // 2. A capitalized token (optionally preceded by 1-2 capitalized tokens)
  //    followed by a place suffix → "King Street", "Niagara River Parkway".
  const suffixRe = new RegExp(
    `\\b((?:[A-Z][a-z0-9]+\\s+){0,2}[A-Z][a-z0-9]+\\s+${PLACE_SUFFIX})\\b`,
    "g",
  );
  for (const m of body.match(suffixRe) ?? []) {
    entities.add(m.toLowerCase().replace(/\s+/g, " ").trim());
  }

  // 3. Multiword capitalized proper nouns (2-4 words), e.g. "Niagara Falls",
  //    "Richmond Hill", "Lake Shore". Single-word names are too noisy (every
  //    sentence-initial word is capitalized), so require ≥ 2 words.
  const properRe = /\b([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|of|on|the|de|la)){1,3})\b/g;
  for (const m of body.match(properRe) ?? []) {
    const norm = m.toLowerCase().replace(/\s+/g, " ").trim();
    // Drop obvious non-place multiword caps that recur in boilerplate.
    if (STOP_PHRASES.has(norm)) continue;
    entities.add(norm);
  }

  return entities;
}

/** Multiword capitalized phrases that are NOT local entities (boilerplate). */
const STOP_PHRASES = new Set<string>([
  "book now",
  "get a quote",
  "contact us",
  "learn more",
  "read more",
  "our fleet",
  "our services",
  "about us",
  "frequently asked",
  "frequently asked questions",
  "terms of service",
  "privacy policy",
  "all rights reserved",
  "customer service",
  "phone number",
]);

// ────────── Main detector ──────────

export function detectDoorway(
  page: DoorwayPage,
  siblings: DoorwayPage[],
  opts: DoorwayOptions = {},
): DoorwayResult {
  const similarityThreshold = opts.similarityThreshold ?? DOORWAY_SIMILARITY_THRESHOLD;
  const minUniqueEntities = opts.minUniqueEntities ?? DOORWAY_MIN_UNIQUE_ENTITIES;
  const shingleSize = opts.shingleSize ?? DOORWAY_SHINGLE_SIZE;

  const reasons: string[] = [];

  // ── Signal 1: max body similarity vs siblings ──
  const pageShingles = shingleSet(tokenize(page.bodyText), shingleSize);
  let maxSim = 0;
  let worstSibling: string | undefined;
  for (const sib of siblings) {
    if (sib.slug === page.slug) continue; // never compare against self
    const sim = jaccard(pageShingles, shingleSet(tokenize(sib.bodyText), shingleSize));
    if (sim > maxSim) {
      maxSim = sim;
      worstSibling = sib.slug;
    }
  }
  const similarityPct = Math.round(maxSim * 100);
  if (maxSim >= similarityThreshold) {
    reasons.push(
      `Body is ${similarityPct}% identical to sibling page "${worstSibling}" ` +
        `(threshold ${Math.round(similarityThreshold * 100)}%) — looks like a swap-the-city-name doorway.`,
    );
  }

  // ── Signal 2: unique local entities vs siblings ──
  const myEntities = extractLocalEntities(page.bodyText);
  const siblingEntities = new Set<string>();
  for (const sib of siblings) {
    if (sib.slug === page.slug) continue;
    for (const e of extractLocalEntities(sib.bodyText)) siblingEntities.add(e);
  }
  let uniqueLocalEntities = 0;
  for (const e of myEntities) if (!siblingEntities.has(e)) uniqueLocalEntities++;

  // Only enforce the unique-entity floor when there ARE siblings to differ
  // from — a project's first page has no siblings and can't be a doorway yet.
  if (siblings.some((s) => s.slug !== page.slug) && uniqueLocalEntities < minUniqueEntities) {
    reasons.push(
      `Only ${uniqueLocalEntities} unique local entit${uniqueLocalEntities === 1 ? "y" : "ies"} ` +
        `vs siblings (need ${minUniqueEntities}) — the page names the same places as its siblings ` +
        `instead of genuinely localizing.`,
    );
  }

  return {
    pass: reasons.length === 0,
    similarityPct,
    worstSibling,
    uniqueLocalEntities,
    reasons,
  };
}
