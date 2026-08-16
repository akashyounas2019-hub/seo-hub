/**
 * SEO agent — the Anthropic-powered planner that proposes alt text for
 * images discovered by the crawler.
 *
 * Phase 1 scope: generate one alt-text proposal per image that lacks one.
 * Phase 2+ adds meta titles, schema, etc. The runner stays the same; new
 * capabilities are just additional ToolDefinitions + handlers.
 *
 * Design notes:
 *   - We do NOT use a tool loop here. Each image is a one-shot completion
 *     for cost reasons (a tool loop adds 2–3 round trips per item; for alt
 *     text the LLM has every signal up front so it can answer in one call).
 *     Higher-tier audits (content rewrites, competitor teardown) will
 *     justify a tool loop.
 *   - System prompt + a short, stable rubric are sent with
 *     `cache_control: ephemeral` so 15 sites × N images amortize the
 *     prefix across the whole run (saves ~70% on prompt tokens).
 *   - The agent is intentionally conservative: it returns `{ skip: true }`
 *     when it can't produce a high-quality alt (image looks decorative,
 *     no nearby context, etc.). We honor that and don't fabricate.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm";
import { composeSystemPrompt } from "./seo-skills";

const ALT_TEXT_PERSONA = `You write alt text for images on small-business websites.`;

const ALT_TEXT_SYSTEM = composeSystemPrompt("alt_text", `${ALT_TEXT_PERSONA}

Rules — apply ALL of them:
1. ≤ 120 characters. Concise is the goal.
2. Describe the image content factually. Do not invent details you can't see.
3. Never start with "Image of" or "Picture of". Lead with the subject.
4. Match the brand voice when the surrounding context implies one.
5. If the image is decorative (icon, background, separator) or you can't tell
   what it shows from the URL and nearby text, return { skip: true }.
6. If the existing alt is already decent, return { skip: true } — don't
   rewrite working alt text.

Output a single JSON object. No prose around it. Shape:
  { "alt": "..." }              -- when you have a good alt
  { "skip": true, "reason": "..." }  -- otherwise

Never include any other keys.`);

export interface AltTextInput {
  imageUrl: string;
  pageUrl: string;
  pageTitle: string;
  nearbyText: string;
  existingAlt: string;
}

export interface AltTextProposal {
  alt: string | null;          // null = skipped
  skipReason: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
}

const MAX_TOKENS = 300;

export async function proposeAltText(input: AltTextInput): Promise<AltTextProposal> {
  const { client, model } = await getLLMClient();
  // Haiku is the right model for this task — it's cheap, fast, and reliable
  // for one-shot factual extraction. We override the org default (Opus 4.7)
  // because alt text doesn't need premium reasoning.
  const useModel = "claude-haiku-4-5";

  const userPrompt = [
    `Image URL: ${input.imageUrl}`,
    `Page URL: ${input.pageUrl}`,
    `Page title: ${input.pageTitle || "(none)"}`,
    `Surrounding text: ${input.nearbyText || "(none)"}`,
    `Existing alt: ${input.existingAlt || "(empty)"}`,
    ``,
    `Produce alt text following the rules. Output JSON only.`,
  ].join("\n");

  const started = Date.now();
  const response = await client.messages.create({
    model: useModel,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: ALT_TEXT_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });
  const durationMs = Date.now() - started;

  // Parse the JSON shape we asked for.
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const parsed = safeParseJson(raw);

  const usage = response.usage;
  const proposal: AltTextProposal = {
    alt: null,
    skipReason: null,
    model: useModel,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    durationMs,
  };

  if (!parsed || typeof parsed !== "object") {
    proposal.skipReason = "parser-failed";
    return proposal;
  }
  if ((parsed as { skip?: unknown }).skip === true) {
    const reason = (parsed as { reason?: unknown }).reason;
    proposal.skipReason = typeof reason === "string" ? reason : "model-declined";
    return proposal;
  }
  const altCandidate = (parsed as { alt?: unknown }).alt;
  if (typeof altCandidate !== "string" || altCandidate.trim().length === 0) {
    proposal.skipReason = "no-alt-in-response";
    return proposal;
  }
  // Hard length cap matching the rubric.
  let alt = altCandidate.trim().replace(/\s+/g, " ");
  if (alt.length > 125) alt = alt.slice(0, 122) + "…";
  proposal.alt = alt;
  // Touch `model` so the value flows through to ai_usage even if the
  // helper signature changes later — the linter then has a use site.
  void model;
  return proposal;
}

function safeParseJson(raw: string): unknown {
  if (!raw) return null;
  // The model occasionally wraps its JSON in ```json fences — strip them.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Try to find the first {...} block as a fallback.
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
