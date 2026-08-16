/**
 * UI/UX + visual design heuristic agent — Phase 7.
 *
 * Looks at a page's hero region (first <section> or top 8 KB of body
 * HTML) and produces a structured list of UX/visual findings. Every
 * finding is a PROPOSAL — Phase 7 hard-locks visual changes to manual
 * review, no exceptions. The proposal payload includes a "what I would
 * change" sentence but does NOT include CSS the platform can apply on
 * its own.
 *
 * Why no screenshot + vision LLM? Adding Playwright/Puppeteer is a
 * 150 MB dependency we said we wouldn't take. Heuristics from HTML +
 * class names get us most of the value at zero infrastructure cost.
 * If we ever add a headless renderer, this agent can swap text input
 * for image input without touching its callers.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm";
import { composeSystemPrompt } from "./seo-skills";

const UIUX_PERSONA = `You audit the hero / above-the-fold region of a web page for UX clarity and visual hierarchy.

You DO NOT propose CSS or HTML changes. You describe issues in plain English so a designer or admin can fix them by hand.`;

export interface UiUxInput {
  url: string;
  pageKind: string;
  /** Top portion of the body HTML — the hero / above-the-fold region.
   *  Limit to 8 KB to keep token cost predictable. */
  heroHtml: string;
  title: string;
  h1: string;
  /** Visible CTAs/buttons text extracted from the hero region. */
  ctaTexts: string[];
}

export interface UiUxFinding {
  category: "hierarchy" | "cta" | "trust" | "typography" | "spacing" | "imagery";
  severity: "info" | "low" | "medium" | "high";
  observation: string;
  suggestion: string;
}

export interface UiUxRecommendation {
  findings: UiUxFinding[];
  overallScore: number;             // 0–100, agent's gut grade of the hero
  skipReason: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
}

export async function proposeUiUxFindings(input: UiUxInput): Promise<UiUxRecommendation> {
  const { client } = await getLLMClient();
  const useModel = "claude-opus-4-7";
  const system = composeSystemPrompt("ui_ux", UIUX_PERSONA);

  const userPrompt = [
    `Audit the hero region of this page.`,
    ``,
    `URL: ${input.url}`,
    `Page kind: ${input.pageKind}`,
    `Title: "${input.title}"`,
    `H1: "${input.h1}"`,
    `Visible CTAs in hero: ${input.ctaTexts.length === 0 ? "(none)" : input.ctaTexts.map((t) => `"${t}"`).join(", ")}`,
    ``,
    `Hero HTML (truncated to 8 KB):`,
    input.heroHtml.slice(0, 8000),
    ``,
    `Output JSON:`,
    `{`,
    `  "overall_score": 0-100,            // hero quality, gut grade`,
    `  "findings": [`,
    `    {`,
    `      "category": "hierarchy|cta|trust|typography|spacing|imagery",`,
    `      "severity": "info|low|medium|high",`,
    `      "observation": "what's wrong",`,
    `      "suggestion": "what to do (plain English, no CSS)"`,
    `    }`,
    `  ]`,
    `}`,
    `Or { "skip": true, "reason": "..." } if the hero is already great.`,
    ``,
    `Rules:`,
    `- Findings must reference SPECIFIC elements you can name (e.g. "the 'Submit' button in the form").`,
    `- Maximum 5 findings. Quality over quantity.`,
    `- Don't propose changes the platform can't verify (color picks, font choices without context).`,
  ].join("\n");

  const started = Date.now();
  const response = await client.messages.create({
    model: useModel,
    max_tokens: 1500,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });
  const durationMs = Date.now() - started;
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const parsed = safeParseJson(raw);

  const out: UiUxRecommendation = {
    findings: [],
    overallScore: 0,
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
    out.skipReason = String((parsed as { reason?: unknown }).reason ?? "agent-skipped");
    return out;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.overall_score === "number") out.overallScore = Math.max(0, Math.min(100, obj.overall_score));
  if (Array.isArray(obj.findings)) {
    out.findings = (obj.findings as unknown[]).filter((x): x is UiUxFinding => {
      if (!x || typeof x !== "object") return false;
      const f = x as Record<string, unknown>;
      return typeof f.category === "string" && typeof f.severity === "string" &&
        typeof f.observation === "string" && typeof f.suggestion === "string";
    }).slice(0, 5);
  }
  return out;
}

/** Extract the hero region from raw HTML. Returns the first <section>,
 *  <header>, or the first 8 KB of body content otherwise. */
export function extractHeroRegion(html: string): string {
  const sec = html.match(/<(?:section|header)\b[^>]*>([\s\S]*?)<\/(?:section|header)>/i);
  if (sec) return sec[0].slice(0, 8000);
  const body = html.match(/<body\b[^>]*>([\s\S]*)/i);
  if (body) return body[1].slice(0, 8000);
  return html.slice(0, 8000);
}

/** Pull visible button / submit / CTA text from a hero region. */
export function extractCtaTexts(heroHtml: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(heroHtml))) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 50) continue;
    const lower = text.toLowerCase();
    // Filter out nav/footer noise — only keep things that look like CTAs.
    if (!/(book|quote|call|get|start|continue|submit|sign|register|join|order|buy|reserve|contact)/i.test(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(text);
    if (out.length >= 6) break;
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
