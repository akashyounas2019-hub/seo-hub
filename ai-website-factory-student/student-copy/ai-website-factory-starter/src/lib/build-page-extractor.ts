/**
 * Extracts the structured JSON block from a `build:page_generate`
 * job's output. The template instructs the model to output a single
 * fenced JSON block; we tolerate prose around it.
 */

import { markdownToHtml } from "./markdown";

export interface ExtractedPage {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  bodyMarkdown: string;
  bodyHtml: string;
  schemaJson: Array<Record<string, unknown>>;
  internalLinksNeeded: string[];
  aiOverviewNotes: string;
}

/**
 * Try to find a `{ ... }` JSON block (preferably inside ```json fences)
 * and parse it. Returns null when nothing parseable found.
 */
export function extractPageFromOutput(output: string): ExtractedPage | null {
  if (!output) return null;

  // First try fenced json
  const fencedMatch = output.match(/```json\s*([\s\S]*?)```/i);
  let candidate = fencedMatch?.[1]?.trim();

  // Fallback: longest top-level {...} block we can find
  if (!candidate) {
    const first = output.indexOf("{");
    const last = output.lastIndexOf("}");
    if (first >= 0 && last > first) {
      candidate = output.slice(first, last + 1);
    }
  }
  if (!candidate) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }

  const metaTitle = String(parsed.meta_title ?? "").trim();
  const metaDescription = String(parsed.meta_description ?? "").trim();
  const h1 = String(parsed.h1 ?? "").trim();
  const bodyMarkdown = String(parsed.body_markdown ?? "").trim();
  const schemaJson = Array.isArray(parsed.schema_json) ? parsed.schema_json as Array<Record<string, unknown>> : [];
  const internalLinksNeeded = Array.isArray(parsed.internal_links_needed)
    ? (parsed.internal_links_needed as unknown[]).map(String)
    : [];
  const aiOverviewNotes = String(parsed.ai_overview_notes ?? "").trim();

  if (!bodyMarkdown && !h1) return null;

  return {
    metaTitle,
    metaDescription,
    h1,
    bodyMarkdown,
    bodyHtml: markdownToHtml(bodyMarkdown),
    schemaJson,
    internalLinksNeeded,
    aiOverviewNotes,
  };
}

/**
 * Score the generated page on AI Overview readiness + technical SEO.
 * Deterministic heuristics — runs in our process, no LLM call. The
 * higher-quality LLM-based `build:quality_review` runs at the project
 * level after all pages exist.
 */
export interface PageScores {
  aiOverviewScore: number;
  seoScore: number;
  notes: string[];
}

export function scorePage(page: ExtractedPage): PageScores {
  const notes: string[] = [];

  // ── AI Overview readiness ─────────────────────────────────────
  let ai = 50;
  const body = page.bodyMarkdown;
  // 1. Opens with a TL;DR (first paragraph is short + assertive)
  const firstPara = body.split(/\n{2,}/)[0]?.trim() ?? "";
  if (firstPara && firstPara.length > 60 && firstPara.length < 600) {
    ai += 15;
  } else {
    notes.push("AI: opening paragraph isn't a sharp TL;DR (target 60-600 chars).");
  }
  // 2. Has comparison table
  if (/\|.*\|/.test(body) && /\|[-:\s]+\|/.test(body)) {
    ai += 10;
  } else {
    notes.push("AI: no comparison table found (LLMs cite tables heavily).");
  }
  // 3. FAQ section with H3 questions
  if (/###\s+.+\?/.test(body)) {
    ai += 15;
  } else {
    notes.push("AI: no FAQ block with H3 questions detected.");
  }
  // 4. Definitive answers — looks for sentences starting with declaratives
  const hasDefinitive = /(?:^|\n)(?:[A-Z][^\n]{20,160}\.)/m.test(body);
  if (hasDefinitive) ai += 10;
  // 5. Mentions sources / citations
  if (page.internalLinksNeeded.length >= 3) ai += 5;
  ai = Math.max(0, Math.min(100, ai));

  // ── Technical SEO ─────────────────────────────────────────────
  let seo = 50;
  const tLen = page.metaTitle.length;
  if (tLen >= 30 && tLen <= 60) seo += 15;
  else notes.push(`SEO: title is ${tLen} chars (target 30-60).`);
  const dLen = page.metaDescription.length;
  if (dLen >= 140 && dLen <= 160) seo += 15;
  else notes.push(`SEO: description is ${dLen} chars (target 140-160).`);
  if (page.h1) seo += 5;
  const h1Count = (body.match(/^#\s+/gm) || []).length;
  if (h1Count === 0) seo += 5; // body should not contain another h1 (h1 is in the page header)
  else notes.push("SEO: body contains additional H1 — should only have H2/H3 in body.");
  if (page.schemaJson.length > 0) seo += 10;
  else notes.push("SEO: no JSON-LD schema generated.");
  seo = Math.max(0, Math.min(100, seo));

  return { aiOverviewScore: ai, seoScore: seo, notes };
}
