/**
 * Content quality agent — Phase 3.
 *
 * Reads a page's signals (word count, age, structure, existing copy) and
 * produces a 1–2 paragraph recommendation telling the admin EXACTLY what
 * to add/edit to bring the page up to standard.
 *
 * Never auto-applies. Output is text only — there is no agent rewrite of
 * the page body yet (Phase 4+ may add a draft-creation flow). Phase 3's
 * value is: surface the gap, propose the fix in plain English, let the
 * admin do the writing.
 *
 * Cost model: Haiku 4.5 — recommendations are short structured text and
 * Haiku handles it cleanly.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm";
import { composeSystemPrompt } from "./seo-skills";

const CONTENT_PERSONA = `You audit web pages for content quality and give the editor a concrete,
actionable rewrite brief. You DO NOT write the new content — you tell the editor what to do, what to add, what to remove.`;

export interface ContentRecommendationInput {
  pageUrl: string;
  pageKind: string;
  title: string;
  h1: string;
  metaDescription: string;
  bodyExcerpt: string;
  wordCount: number;
  lastModified: string | null;
  publishedAt: string | null;
  author: string;
  hasSources: boolean;
  /** What problem(s) triggered this audit — feeds the agent so it knows
   *  what to focus the brief on. */
  findings: string[];
}

export interface ContentRecommendation {
  brief: string | null;
  skipReason: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
}

export async function proposeContentRecommendation(
  input: ContentRecommendationInput,
): Promise<ContentRecommendation> {
  const { client } = await getLLMClient();
  const useModel = "claude-haiku-4-5";
  const system = composeSystemPrompt("content_quality", CONTENT_PERSONA);

  const userPrompt = [
    `Page URL: ${input.pageUrl}`,
    `Page kind: ${input.pageKind}`,
    `Title: "${input.title}"`,
    `H1: "${input.h1}"`,
    `Meta description: "${input.metaDescription}"`,
    `Word count: ${input.wordCount}`,
    `Last modified: ${input.lastModified ?? "(unknown)"}`,
    `Published: ${input.publishedAt ?? "(unknown)"}`,
    `Author: ${input.author || "(none)"}`,
    `Has external sources: ${input.hasSources ? "yes" : "no"}`,
    ``,
    `Body excerpt (first 1500 chars):`,
    input.bodyExcerpt.slice(0, 1500),
    ``,
    `Findings the auditor flagged on this page:`,
    ...input.findings.map((f) => `- ${f}`),
    ``,
    `Write a 1–2 paragraph brief telling the editor what to do. Be specific:`,
    `  - Name the sections to add (e.g. "Add an H2 'How long is the trip?' with 100 words covering …").`,
    `  - Name the trust signals missing (author bio, date, citations).`,
    `  - If the page is fine as-is, return { "skip": true, "reason": "..." }.`,
    ``,
    `Output JSON only. Shape:`,
    `  { "brief": "..." }`,
    `  { "skip": true, "reason": "..." }`,
  ].join("\n");

  const started = Date.now();
  const response = await client.messages.create({
    model: useModel,
    max_tokens: 600,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });
  const durationMs = Date.now() - started;
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const parsed = safeParseJson(raw);

  const out: ContentRecommendation = {
    brief: null,
    skipReason: null,
    model: useModel,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    durationMs,
  };
  if (!parsed || typeof parsed !== "object") {
    out.skipReason = "parser-failed";
    return out;
  }
  if ((parsed as { skip?: unknown }).skip === true) {
    out.skipReason = String((parsed as { reason?: unknown }).reason ?? "model-declined");
    return out;
  }
  const brief = (parsed as { brief?: unknown }).brief;
  if (typeof brief !== "string" || brief.trim().length === 0) {
    out.skipReason = "no-brief-in-response";
    return out;
  }
  out.brief = brief.trim();
  return out;
}

function safeParseJson(raw: string): unknown {
  if (!raw) return null;
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}
