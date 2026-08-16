/**
 * P5 — Internal linking optimizer.
 *
 * Computes topical similarity between pages in a build project so that
 * `build:page_generate` can auto-suggest 3-5 relevant internal links to
 * include in each new page's `related_links` section.
 *
 * Approach (v1, deterministic, no LLM call):
 *   1. Build a TF-IDF vector for each page from title + meta_description + h1.
 *   2. Cosine-similarity between every pair.
 *   3. For a given target page, return the top-K most similar pages.
 *
 * Why TF-IDF (not embeddings):
 *   - Zero API cost (matches the platform's $0-marginal-cost rule).
 *   - Deterministic — same input always returns same suggestions.
 *   - Fast: a 50-page project takes < 5ms.
 *   - "Good enough" for cleaning-services content where the keyword overlap
 *     between related pages (villa deep clean vs move-out clean vs post-
 *     construction clean) is naturally high.
 *
 * v2 (later) could swap in embeddings (Haiku batch call) for nuanced
 * semantic matches across topics that don't share keywords.
 *
 * Used by `build:page_generate`: the prompt builder calls
 * `suggestRelatedPages()` and injects the result as a list of candidate
 * slugs into the prompt. The model picks 3-5 of them for the
 * `related_links` SECTION block.
 */

import { db, ensureSchema } from "@/db/client";
import { siteBuildPages } from "@/db/schema";
import { eq, ne, and } from "drizzle-orm";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "for", "on",
  "at", "by", "with", "as", "from", "is", "are", "was", "were", "be",
  "this", "that", "it", "its", "you", "your", "we", "our", "us", "they",
  "their", "them", "i", "my", "me", "what", "which", "who", "how", "when",
  "where", "why", "all", "any", "some", "more", "most", "less", "than",
  "into", "out", "up", "down", "over", "under", "again", "if", "then",
  "so", "not", "no", "do", "does", "did", "have", "has", "had", "can",
  "will", "would", "should", "could", "may", "might", "must", "just",
  "also", "only", "very", "too", "even", "after", "before", "between",
]);

/** Tokenize text → lowercased word stems (very simple — no full stemmer). */
function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 30 && !STOPWORDS.has(t));
}

/** Build a TF map from a list of tokens. */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/** Compute IDF across all docs. */
function computeIdf(docs: Map<string, number>[]): Map<string, number> {
  const N = docs.length;
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of doc.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    // Smooth IDF: log((N + 1) / (count + 1)) + 1
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }
  return idf;
}

/** Compute TF-IDF weighted vector from TF + IDF. */
function tfIdfVector(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, count] of tf) {
    vec.set(term, count * (idf.get(term) ?? 0));
  }
  return vec;
}

/** Cosine similarity between two TF-IDF vectors. */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (const [term, val] of a) {
    aMag += val * val;
    const bVal = b.get(term);
    if (bVal !== undefined) dot += val * bVal;
  }
  for (const val of b.values()) bMag += val * val;
  const denom = Math.sqrt(aMag) * Math.sqrt(bMag);
  return denom === 0 ? 0 : dot / denom;
}

export interface PageLinkCandidate {
  slug: string;
  title: string;
  metaDescription: string | null;
  pageType: string;
  similarity: number;
}

/**
 * Return the top-K pages in `projectId` most topically similar to the
 * supplied `targetText` (use the new page's title + h1 + target keyword
 * before it's saved). Excludes any page whose slug is in `excludeSlugs`.
 *
 * Returns an empty array if there are fewer than 2 pages in the project
 * (no other pages to link to).
 */
export async function suggestRelatedPages(input: {
  projectId: string;
  /** Combined text representing the page we're generating: title + h1 + keyword + excerpt. */
  targetText: string;
  /** Pages to exclude from suggestions (the new page's own slug, dropped pages, etc.). */
  excludeSlugs?: string[];
  /** Top-K matches to return (default 8 — model picks 3-5 from the list). */
  limit?: number;
}): Promise<PageLinkCandidate[]> {
  const { projectId, targetText, excludeSlugs = [], limit = 8 } = input;
  await ensureSchema();
  const d = db();

  // Pull all existing pages in the project — title, meta_description, h1, page_type, page_slug.
  const rows = await d
    .select({
      slug: siteBuildPages.pageSlug,
      title: siteBuildPages.title,
      h1: siteBuildPages.h1,
      metaDescription: siteBuildPages.metaDescription,
      pageType: siteBuildPages.pageType,
    })
    .from(siteBuildPages)
    .where(eq(siteBuildPages.projectId, projectId));

  if (rows.length === 0) return [];

  // Filter out excluded slugs + the home page (typically not a link target).
  const excludeSet = new Set([...excludeSlugs, "/"]);
  const candidates = rows.filter((r) => !excludeSet.has(r.slug));
  if (candidates.length === 0) return [];

  // Build TF maps for each candidate + the target.
  const targetTf = termFreq(tokenize(targetText));
  const candidateTfs = candidates.map((c) =>
    termFreq(tokenize(`${c.title} ${c.h1 ?? ""} ${c.metaDescription ?? ""}`)),
  );

  // IDF computed over all candidates (target doesn't influence IDF — it's the query).
  const idf = computeIdf(candidateTfs);

  // TF-IDF vectors.
  const targetVec = tfIdfVector(targetTf, idf);
  const candidateVecs = candidateTfs.map((tf) => tfIdfVector(tf, idf));

  // Score + sort.
  const scored = candidates
    .map((c, i) => ({
      slug: c.slug,
      title: c.title,
      metaDescription: c.metaDescription,
      pageType: c.pageType,
      similarity: cosineSimilarity(targetVec, candidateVecs[i]),
    }))
    .filter((c) => c.similarity > 0.02) // skip totally unrelated pages
    .sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, limit);
}

/**
 * Surface orphan pages — pages that exist in the project but are NOT
 * referenced by any other page's related_links. Useful for the dashboard
 * to flag "this page has zero inbound internal links — it's invisible
 * to crawlers and gets no link equity."
 *
 * Conservative implementation: scans `body_markdown` for related-links
 * references to each page's slug. Only flags as orphan if no inbound
 * link is found.
 */
export async function findOrphanPages(input: {
  projectId: string;
}): Promise<Array<{ slug: string; title: string; pageType: string }>> {
  await ensureSchema();
  const d = db();
  const rows = await d
    .select({
      id: siteBuildPages.id,
      slug: siteBuildPages.pageSlug,
      title: siteBuildPages.title,
      pageType: siteBuildPages.pageType,
      bodyMarkdown: siteBuildPages.bodyMarkdown,
    })
    .from(siteBuildPages)
    .where(eq(siteBuildPages.projectId, input.projectId));

  if (rows.length === 0) return [];

  // For each page, check if its slug appears in any OTHER page's body.
  const orphans: Array<{ slug: string; title: string; pageType: string }> = [];
  for (const target of rows) {
    if (target.slug === "/") continue; // home isn't an orphan
    if (target.pageType === "contact") continue; // contact isn't typically linked-to
    const inboundLinks = rows
      .filter((r) => r.id !== target.id)
      .some((r) => r.bodyMarkdown && r.bodyMarkdown.includes(target.slug));
    if (!inboundLinks) {
      orphans.push({
        slug: target.slug,
        title: target.title,
        pageType: target.pageType,
      });
    }
  }
  return orphans;
}

/**
 * Convenience: format a list of PageLinkCandidate as a prompt-ready block
 * that can be embedded in `build:page_generate` so the model knows which
 * existing pages to choose from when filling `related_links`.
 */
export function formatCandidatesForPrompt(candidates: PageLinkCandidate[]): string {
  if (candidates.length === 0) return "";
  return [
    `\n--- INTERNAL LINK CANDIDATES (auto-suggested by similarity) ---`,
    `These are the existing pages most topically related to this new page.`,
    `Pick 3-5 of them to include in the related_links SECTION block. Choose ones`,
    `that would genuinely help the reader continue their journey — NOT just the`,
    `top-scored. Mix page types (services, areas, blogs) when possible.`,
    ``,
    ...candidates.map(
      (c, i) =>
        `${i + 1}. ${c.slug} (${c.pageType}, similarity ${c.similarity.toFixed(2)})\n   "${c.title}"${c.metaDescription ? `\n   ${c.metaDescription.slice(0, 140)}` : ""}`,
    ),
    `--- END LINK CANDIDATES ---\n`,
  ].join("\n");
}
