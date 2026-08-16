/**
 * Page-design agent — turn natural-language requests into a scoped
 * CSS override blob the WP plugin can accept.
 *
 * Example input:
 *   "Make the CTA button red and double its size; bigger padding on the hero."
 *
 * Example output blob (the shape the plugin saves):
 *   {
 *     "vars": {
 *       "--gyl-page-cta-bg":    "#c0392b",
 *       "--gyl-page-cta-color": "#ffffff",
 *       "--gyl-page-cta-radius":"10px",
 *       "--gyl-page-hero-pad":  "96px 32px"
 *     },
 *     "custom_css": ".cta-button { padding: 18px 32px; font-size: 18px; }"
 *   }
 *
 * The plugin scopes everything to body.page-id-<N> automatically, so
 * the agent doesn't have to think about isolation — just describe
 * what to change.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm";

export interface DesignAgentInput {
  request: string;
  /** Site context — name + brand theme so the agent stays on-brand. */
  siteName: string;
  siteDomain: string;
  brandTheme?: {
    primary?: string;
    surface?: string;
    accent?: string;
    fontFamilyBody?: string;
    fontFamilyHeading?: string;
  };
  /** Short HTML excerpt of the page (first 6 KB of body) for context. */
  pageHtmlExcerpt: string;
  pageTitle: string;
  pageUrl: string;
}

export interface DesignAgentBlob {
  vars: Record<string, string>;
  custom_css: string;
}

export interface DesignAgentResult {
  blob: DesignAgentBlob | null;
  rationale: string;
  skipReason: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

const SYSTEM = `You're a senior product designer translating natural-language design requests into safe, scoped CSS overrides for a WordPress page.

Output a JSON object with TWO fields only:
  {
    "vars":        Record<string, string>,   // CSS custom property values
    "custom_css":  string                     // raw CSS, no selectors leaving the page
  }

Rules:
- Variable names start with "--gyl-page-" and are kebab-case. Use these slots when possible:
    --gyl-page-cta-bg, --gyl-page-cta-color, --gyl-page-cta-radius
    --gyl-page-hero-bg, --gyl-page-hero-pad
    --gyl-page-heading-color, --gyl-page-body-color
    --gyl-page-section-pad
- For things outside those slots, write CSS rules in "custom_css".
- Don't include selectors with html, body, or :root in custom_css — the plugin auto-scopes everything.
- Never use url(), @import, expression(), or anything outside plain CSS values.
- Respect the brand theme. If the user says "red" but the brand is navy, ask whether they really mean to break the brand by softening the colour toward the brand palette — but still produce a valid blob, your "rationale" can note the conflict.
- If the request is impossible from CSS alone (e.g. "remove this section"), set both fields empty and explain in rationale.

Also include a "rationale" string outside the JSON object — 1-2 sentences describing what you changed and why. Format:

CSS_JSON:
<json>

RATIONALE:
<text>`;

export async function proposePageDesign(input: DesignAgentInput): Promise<DesignAgentResult> {
  const { client } = await getLLMClient();
  const useModel = "claude-opus-4-7";

  const brand = input.brandTheme
    ? [
        input.brandTheme.primary ? `Brand primary: ${input.brandTheme.primary}` : "",
        input.brandTheme.surface ? `Brand surface: ${input.brandTheme.surface}` : "",
        input.brandTheme.accent ? `Brand accent: ${input.brandTheme.accent}` : "",
        input.brandTheme.fontFamilyBody ? `Body font: ${input.brandTheme.fontFamilyBody}` : "",
        input.brandTheme.fontFamilyHeading ? `Heading font: ${input.brandTheme.fontFamilyHeading}` : "",
      ].filter(Boolean).join("\n")
    : "(no brand theme set yet)";

  const userPrompt = [
    `Site: ${input.siteName} (${input.siteDomain})`,
    `Page: ${input.pageTitle} — ${input.pageUrl}`,
    ``,
    `BRAND CONTEXT`,
    brand,
    ``,
    `PAGE HTML EXCERPT (first 6 KB)`,
    input.pageHtmlExcerpt.slice(0, 6000),
    ``,
    `USER REQUEST`,
    input.request,
    ``,
    `Produce the CSS_JSON + RATIONALE following the system rules.`,
  ].join("\n");

  const started = Date.now();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: useModel,
      max_tokens: 1500,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    return {
      blob: null,
      rationale: "",
      skipReason: err instanceof Error ? err.message : String(err),
      model: useModel,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - started,
    };
  }
  const durationMs = Date.now() - started;
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const { json, rationale } = splitJsonAndRationale(raw);

  const parsed = json ? safeParseJson(json) : null;
  const blob: DesignAgentBlob | null = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? {
        vars: extractVars((parsed as Record<string, unknown>).vars),
        custom_css: typeof (parsed as Record<string, unknown>).custom_css === "string"
          ? (parsed as Record<string, unknown>).custom_css as string
          : "",
      }
    : null;

  const isEmpty = !blob || (Object.keys(blob.vars).length === 0 && blob.custom_css.trim() === "");
  return {
    blob: isEmpty ? null : blob,
    rationale: rationale.trim(),
    skipReason: isEmpty ? "empty-blob" : null,
    model: useModel,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };
}

function splitJsonAndRationale(raw: string): { json: string; rationale: string } {
  const jsonMatch = raw.match(/CSS_JSON:\s*([\s\S]*?)\n\s*RATIONALE:/i);
  if (jsonMatch) {
    const rationale = raw.split(/RATIONALE:/i)[1] ?? "";
    return { json: jsonMatch[1].trim(), rationale: rationale.trim() };
  }
  // Fall back — if the model didn't follow the format, try to find a JSON block.
  const m = raw.match(/\{[\s\S]*\}/);
  return { json: m?.[0] ?? "", rationale: "" };
}

function safeParseJson(raw: string): unknown {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(stripped); } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

function extractVars(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k !== "string" || !k.startsWith("--gyl-page-")) continue;
    if (typeof v !== "string") continue;
    if (v.trim().length === 0) continue;
    out[k] = v.trim().slice(0, 200);
  }
  return out;
}
