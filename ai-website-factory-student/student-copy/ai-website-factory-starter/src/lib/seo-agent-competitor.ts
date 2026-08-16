/**
 * Competitor teardown agent — Phase 4.
 *
 * Read-only. Given the site under review + a competitor's crawled signals,
 * produces a structured intel brief: what they do better, what you do
 * better, and a small list of "adopt" recommendations.
 *
 * Cost: Opus 4.7. Teardown reasoning needs full-strength model — Haiku
 * tends to surface generic SEO advice; Opus actually compares the two
 * pages.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm";
import { composeSystemPrompt } from "./seo-skills";

const COMPETITOR_PERSONA = `You are an SEO + CRO analyst. You're given two pages — one is "ours", one is a "competitor" — and you produce an honest, specific teardown. Bias toward concrete observations; avoid generic SEO advice the user already knows.`;

export interface CompetitorInput {
  /** Your site under review. */
  ours: {
    url: string;
    title: string;
    h1: string;
    h2: string[];
    metaDescription: string;
    bodyExcerpt: string;
    wordCount: number;
    schemaTypes: string[];
  };
  /** Competitor page targeting the same keyword cluster. */
  competitor: {
    url: string;
    title: string;
    h1: string;
    h2: string[];
    metaDescription: string;
    bodyExcerpt: string;
    wordCount: number;
    schemaTypes: string[];
  };
  /** The keyword or topic both pages target. */
  targetKeyword?: string;
}

export interface CompetitorTeardown {
  theyDoBetter: string[];
  weDoBetter: string[];
  adopt: Array<{ what: string; effort: "small" | "medium" | "large"; rationale: string }>;
  skipReason: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
}

export async function proposeCompetitorTeardown(input: CompetitorInput): Promise<CompetitorTeardown> {
  const { client } = await getLLMClient();
  const useModel = "claude-opus-4-7";
  const system = composeSystemPrompt("competitor", COMPETITOR_PERSONA);

  const userPrompt = [
    `Target keyword: ${input.targetKeyword ?? "(infer from titles)"}`,
    ``,
    `--- OUR PAGE ---`,
    `URL: ${input.ours.url}`,
    `Title: "${input.ours.title}"`,
    `H1: "${input.ours.h1}"`,
    `H2s: ${input.ours.h2.slice(0, 8).join(" | ")}`,
    `Meta description: "${input.ours.metaDescription}"`,
    `Word count: ${input.ours.wordCount}`,
    `Schema types: ${input.ours.schemaTypes.join(", ") || "(none)"}`,
    `Body excerpt: ${input.ours.bodyExcerpt.slice(0, 1200)}`,
    ``,
    `--- COMPETITOR PAGE ---`,
    `URL: ${input.competitor.url}`,
    `Title: "${input.competitor.title}"`,
    `H1: "${input.competitor.h1}"`,
    `H2s: ${input.competitor.h2.slice(0, 8).join(" | ")}`,
    `Meta description: "${input.competitor.metaDescription}"`,
    `Word count: ${input.competitor.wordCount}`,
    `Schema types: ${input.competitor.schemaTypes.join(", ") || "(none)"}`,
    `Body excerpt: ${input.competitor.bodyExcerpt.slice(0, 1200)}`,
    ``,
    `Output a JSON object:`,
    `{`,
    `  "they_do_better": ["..."],          // 2-5 specific things, observation-level`,
    `  "we_do_better":   ["..."],          // 2-5 specific things`,
    `  "adopt": [`,
    `    { "what": "...", "effort": "small|medium|large", "rationale": "..." }`,
    `  ]                                     // 1-3 specific tactics to adopt`,
    `}`,
    ``,
    `Or { "skip": true, "reason": "..." } if comparison isn't meaningful (e.g. mismatched intent).`,
    ``,
    `Rules:`,
    `- Be specific. "They use schema" is bad; "They include FAQPage schema with 6 Q&As" is good.`,
    `- Don't recommend adopting brand-specific elements (their unique value props, their case studies).`,
    `- Reject vague observations like "they have more content" without saying what content.`,
  ].join("\n");

  const started = Date.now();
  const response = await client.messages.create({
    model: useModel,
    max_tokens: 2000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });
  const durationMs = Date.now() - started;
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const parsed = safeParseJson(raw);

  const out: CompetitorTeardown = {
    theyDoBetter: [],
    weDoBetter: [],
    adopt: [],
    skipReason: null,
    model: useModel,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    durationMs,
  };
  if (!parsed || typeof parsed !== "object") { out.skipReason = "parser-failed"; return out; }
  if ((parsed as { skip?: unknown }).skip === true) {
    out.skipReason = String((parsed as { reason?: unknown }).reason ?? "model-declined");
    return out;
  }
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.they_do_better)) out.theyDoBetter = (obj.they_do_better as unknown[]).filter((x): x is string => typeof x === "string");
  if (Array.isArray(obj.we_do_better)) out.weDoBetter = (obj.we_do_better as unknown[]).filter((x): x is string => typeof x === "string");
  if (Array.isArray(obj.adopt)) {
    out.adopt = (obj.adopt as unknown[]).filter((x): x is { what: string; effort: "small" | "medium" | "large"; rationale: string } => {
      if (!x || typeof x !== "object") return false;
      const a = x as Record<string, unknown>;
      return typeof a.what === "string" && typeof a.rationale === "string" &&
        (a.effort === "small" || a.effort === "medium" || a.effort === "large");
    });
  }
  if (out.theyDoBetter.length === 0 && out.weDoBetter.length === 0 && out.adopt.length === 0) {
    out.skipReason = "empty-teardown";
  }
  return out;
}

function safeParseJson(raw: string): unknown {
  if (!raw) return null;
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(stripped); } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}
