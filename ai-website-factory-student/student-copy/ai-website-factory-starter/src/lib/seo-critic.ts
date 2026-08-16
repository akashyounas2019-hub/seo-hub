/**
 * V3 — Critic-LLM pass.
 *
 * After the *generator* LLM produces a proposal, a *separate* Haiku
 * 4.5 call evaluates it from a hostile perspective. Returns a
 * confidence score (0-100) plus a list of issues.
 *
 * Used as a soft gate, not a hard one: below 70 → the proposal is
 * still inserted but auto_apply is forced to false. The admin sees it
 * in the inbox with the critic's note attached, and decides.
 *
 * Cost: ~$0.0001 per call on Haiku 4.5 (a few hundred input tokens, ~150
 * output). Doubles the per-proposal LLM cost in exchange for halving
 * the false-positive rate on content.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm";

export interface CriticVerdict {
  confidence: number;          // 0-100; >= 70 = auto-apply safe
  issues: string[];            // short list of specific concerns
  model: string;
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM_PROMPT = `You are a hostile reviewer for an AI SEO agent. You inspect proposed changes and find what's wrong with them.

Score each proposal on a 0-100 confidence scale, where:
  100 = absolutely safe to ship unsupervised
  80  = solid, minor nit possible
  60  = mixed — would benefit from human review
  40  = real problems, do not ship auto
  20  = wrong / hallucinated / unsafe
  0   = actively harmful

Output JSON only:
  {
    "confidence": <0-100>,
    "issues": ["short specific concerns; empty array if clean"]
  }

Rules:
  - Be skeptical, not generous. Default to 65 unless you see real evidence of quality.
  - Issues should name SPECIFIC things in the proposal, not generic SEO advice.
  - If the proposal references facts you can't verify from the context, flag it.
  - If the brand voice notes contradict the proposal, score below 50.
  - Don't praise. Don't explain your scoring. JSON only.`;

interface CriticInputBase {
  /** Site name + URL — for context. */
  siteName: string;
  siteDomain: string;
  /** Optional brand-voice notes the admin set. */
  brandVoice?: string | null;
}

export interface CriticAltTextInput extends CriticInputBase {
  kind: "alt_text";
  proposedAlt: string;
  imageUrl: string;
  pageUrl: string;
  pageTitle: string;
  nearbyText: string;
}
export interface CriticMetaTitleInput extends CriticInputBase {
  kind: "meta_title";
  before: string;
  after: string;
  pageUrl: string;
  h1: string;
}
export interface CriticMetaDescInput extends CriticInputBase {
  kind: "meta_description";
  before: string;
  after: string;
  pageUrl: string;
  title: string;
}
export interface CriticContentRewriteInput extends CriticInputBase {
  kind: "content_rewrite";
  pageUrl: string;
  pageKind: string;
  brief: string;
  issues: string[];
}

/**
 * V-content — critic for a content brief (admin or agent wrote it). Looks
 * for: vague generalities ("create engaging content"), missing target
 * keyword, no clear angle, contradictions with brand voice, hallucinated
 * facts (numbers, dates, claims).
 */
export interface CriticContentBriefInput extends CriticInputBase {
  kind: "content_brief";
  title: string;
  targetKeyword: string | null;
  contentType: string; // 'post' | 'page'
  briefMarkdown: string;
}

/**
 * V-competitor — critic for a competitor teardown finding. Looks for:
 * generic SEO advice the user already knows, observations that can't be
 * verified from the supplied context, "adopt" suggestions that would
 * actually contradict our brand voice, low-effort lazy comparisons.
 */
export interface CriticCompetitorInput extends CriticInputBase {
  kind: "competitor_teardown";
  competitorUrl: string;
  ourUrl: string;
  theyDoBetter: string[];
  weDoBetter: string[];
  adopt: Array<{ what: string; effort?: string; rationale?: string }>;
}

export type CriticInput =
  | CriticAltTextInput
  | CriticMetaTitleInput
  | CriticMetaDescInput
  | CriticContentRewriteInput
  | CriticContentBriefInput
  | CriticCompetitorInput;

const NEUTRAL_VERDICT: Omit<CriticVerdict, "model"> = {
  confidence: 65,
  issues: [],
  inputTokens: 0,
  outputTokens: 0,
};

export async function criticPass(input: CriticInput): Promise<CriticVerdict> {
  const useModel = "claude-haiku-4-5";
  let client: Anthropic;
  try {
    ({ client } = await getLLMClient());
  } catch {
    // If the platform doesn't have an LLM key, we can't run the critic.
    // Be generous and let the proposal through with neutral confidence.
    return { ...NEUTRAL_VERDICT, model: "no-llm" };
  }

  const userPrompt = buildPrompt(input);
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: useModel,
      max_tokens: 350,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch {
    // Network blip — be neutral, don't block the proposal.
    return { ...NEUTRAL_VERDICT, model: useModel };
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const parsed = safeParseJson(raw);
  const fallback: CriticVerdict = {
    ...NEUTRAL_VERDICT,
    model: useModel,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  if (!parsed || typeof parsed !== "object") return fallback;
  const obj = parsed as Record<string, unknown>;
  const confRaw = obj.confidence;
  const confidence =
    typeof confRaw === "number" ? Math.max(0, Math.min(100, Math.round(confRaw))) : NEUTRAL_VERDICT.confidence;
  const issuesRaw = obj.issues;
  const issues = Array.isArray(issuesRaw)
    ? (issuesRaw.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 10))
    : [];
  return {
    confidence,
    issues,
    model: useModel,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function buildPrompt(input: CriticInput): string {
  const ctx = [
    `Site: ${input.siteName} (${input.siteDomain})`,
    input.brandVoice ? `Brand voice notes: ${input.brandVoice}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const base = `--- CONTEXT ---\n${ctx}\n\n--- PROPOSAL ---\n`;
  switch (input.kind) {
    case "alt_text":
      return base + [
        `Kind: alt_text`,
        `Image URL: ${input.imageUrl}`,
        `Page URL: ${input.pageUrl}`,
        `Page title: "${input.pageTitle}"`,
        `Surrounding text (excerpt): "${input.nearbyText.slice(0, 300)}"`,
        ``,
        `Proposed alt text: "${input.proposedAlt}"`,
      ].join("\n");
    case "meta_title":
      return base + [
        `Kind: meta_title`,
        `Page URL: ${input.pageUrl}`,
        `H1: "${input.h1}"`,
        `Current title: "${input.before}"`,
        `Proposed title: "${input.after}"`,
      ].join("\n");
    case "meta_description":
      return base + [
        `Kind: meta_description`,
        `Page URL: ${input.pageUrl}`,
        `Title on page: "${input.title}"`,
        `Current description: "${input.before}"`,
        `Proposed description: "${input.after}"`,
      ].join("\n");
    case "content_rewrite":
      return base + [
        `Kind: content_rewrite (brief, not full draft)`,
        `Page URL: ${input.pageUrl}`,
        `Page kind: ${input.pageKind}`,
        `Issues that triggered this: ${input.issues.join("; ")}`,
        ``,
        `Proposed brief:`,
        input.brief.slice(0, 2000),
      ].join("\n");
    case "content_brief":
      return base + [
        `Kind: content_brief`,
        `Title: "${input.title}"`,
        `Target keyword: ${input.targetKeyword ? `"${input.targetKeyword}"` : "(none specified)"}`,
        `Content type: ${input.contentType}`,
        ``,
        `Look for these specific failure modes in the brief:`,
        ` - Vague generalities ("create engaging content", "best in class", "world-class")`,
        ` - Missing concrete angle / unique POV — would 100 SEO writers all draft the same thing?`,
        ` - Target keyword absent from title and brief body`,
        ` - Claims of facts/numbers/dates with no source`,
        ` - Brief is shorter than ~400 chars (too thin to guide a draft)`,
        ` - Brief contradicts brand voice notes`,
        ``,
        `Brief markdown:`,
        input.briefMarkdown.slice(0, 4000),
      ].join("\n");
    case "competitor_teardown":
      return base + [
        `Kind: competitor_teardown`,
        `Our URL: ${input.ourUrl}`,
        `Competitor URL: ${input.competitorUrl}`,
        ``,
        `Look for these specific failure modes in the teardown:`,
        ` - Generic SEO advice the operator already knows ("improve mobile UX", "add more content")`,
        ` - Observations that can't be verified from the supplied page text`,
        ` - "Adopt" suggestions that would contradict the brand voice`,
        ` - Lazy comparisons ("they have more reviews") with no concrete next step`,
        ` - Empty insight — just listing things both sites have`,
        ``,
        `What the competitor does better (${input.theyDoBetter.length}):`,
        ...input.theyDoBetter.slice(0, 8).map((t) => ` - ${t}`),
        ``,
        `What we do better (${input.weDoBetter.length}):`,
        ...input.weDoBetter.slice(0, 8).map((t) => ` - ${t}`),
        ``,
        `Adopt suggestions (${input.adopt.length}):`,
        ...input.adopt.slice(0, 8).map((a) => ` - [${a.effort ?? "?"}] ${a.what}${a.rationale ? ` — ${a.rationale}` : ""}`),
      ].join("\n");
  }
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

/** Threshold below which we force auto_apply=false. */
export const CRITIC_AUTO_THRESHOLD = 70;
