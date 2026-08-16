/**
 * On-page agent functions — Phase 2.
 *
 * Three distinct proposers, each one-shot (no tool loop). The skill
 * modules for `on-page-seo`, `copywriting`, and `schema-markup` get
 * composed into the system prompt automatically when `audit_kind =
 * 'on_page'`.
 *
 * Cost model:
 *   - Title + description rewrites: Haiku 4.5 (cheap, fast, plenty good).
 *   - Schema generation: Opus 4.7 — schema must be structurally correct
 *     JSON-LD; Haiku flakes on the long structured output sometimes.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getLLMClient } from "./llm";
import { composeSystemPrompt } from "./seo-skills";

interface AgentProposalBase {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  skipReason: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Meta title
// ─────────────────────────────────────────────────────────────────────

const META_TITLE_PERSONA = `You rewrite under-performing or over-long <title> tags so they fit Google's 580-pixel SERP width and front-load the primary keyword.`;

export interface MetaTitleInput {
  pageUrl: string;
  currentTitle: string;
  h1: string;
  metaDescription: string;
  primaryKeyword?: string;
  brandName?: string;
}

export interface MetaTitleProposal extends AgentProposalBase {
  title: string | null;
}

export async function proposeMetaTitle(input: MetaTitleInput): Promise<MetaTitleProposal> {
  const { client } = await getLLMClient();
  const useModel = "claude-haiku-4-5";
  const system = composeSystemPrompt("on_page", META_TITLE_PERSONA);
  const userPrompt = [
    `Page URL: ${input.pageUrl}`,
    `Current title (${input.currentTitle.length} chars): "${input.currentTitle}"`,
    `H1: "${input.h1}"`,
    `Meta description: "${input.metaDescription}"`,
    input.primaryKeyword ? `Primary keyword hint: ${input.primaryKeyword}` : "",
    input.brandName ? `Brand name: ${input.brandName}` : "",
    ``,
    `Decide: rewrite the title or leave it. Return JSON:`,
    `  { "title": "..." }      -- when you have a better title`,
    `  { "skip": true, "reason": "..." }`,
    `Hard rule: title must be 30–60 characters. Never include the words "Image of", "Page about", etc.`,
  ].filter(Boolean).join("\n");

  const started = Date.now();
  const response = await client.messages.create({
    model: useModel,
    max_tokens: 200,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });
  const durationMs = Date.now() - started;
  return parseShortProposal<MetaTitleProposal>(response, durationMs, useModel, "title", 30, 60);
}

// ─────────────────────────────────────────────────────────────────────
// Meta description
// ─────────────────────────────────────────────────────────────────────

const META_DESC_PERSONA = `You write meta descriptions that lift CTR. Lead with the customer benefit, end with a verb CTA, fit 140–160 characters.`;

export interface MetaDescriptionInput {
  pageUrl: string;
  currentDescription: string;
  title: string;
  h1: string;
  bodyExcerpt: string;
  primaryKeyword?: string;
}

export interface MetaDescriptionProposal extends AgentProposalBase {
  description: string | null;
}

export async function proposeMetaDescription(input: MetaDescriptionInput): Promise<MetaDescriptionProposal> {
  const { client } = await getLLMClient();
  const useModel = "claude-haiku-4-5";
  const system = composeSystemPrompt("on_page", META_DESC_PERSONA);
  const userPrompt = [
    `Page URL: ${input.pageUrl}`,
    `Title: "${input.title}"`,
    `H1: "${input.h1}"`,
    `Current description (${input.currentDescription.length} chars): "${input.currentDescription}"`,
    `Page body excerpt: ${input.bodyExcerpt.slice(0, 600)}`,
    input.primaryKeyword ? `Primary keyword hint: ${input.primaryKeyword}` : "",
    ``,
    `Decide: rewrite or leave. Return JSON:`,
    `  { "description": "..." }`,
    `  { "skip": true, "reason": "..." }`,
    `Hard rule: 140–160 characters. End with a verb CTA where possible (Book, Call, Get).`,
  ].filter(Boolean).join("\n");

  const started = Date.now();
  const response = await client.messages.create({
    model: useModel,
    max_tokens: 300,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });
  const durationMs = Date.now() - started;
  return parseShortProposal<MetaDescriptionProposal>(response, durationMs, useModel, "description", 140, 160);
}

// ─────────────────────────────────────────────────────────────────────
// Schema injection
// ─────────────────────────────────────────────────────────────────────

const SCHEMA_PERSONA = `You generate valid JSON-LD schema.org markup. The output goes verbatim into a <script type="application/ld+json"> tag, so it MUST be parseable JSON.`;

export interface SchemaInput {
  pageUrl: string;
  pageType: "home" | "service" | "city" | "article" | "faq" | "contact" | "about" | "unknown";
  title: string;
  h1: string;
  metaDescription: string;
  bodyExcerpt: string;
  existingSchemaTypes: string[];   // types already present on the page
  site: {
    name: string;
    domain: string;
    city: string | null;
    region: string | null;
  };
}

export interface SchemaProposal extends AgentProposalBase {
  schemaType: string | null;
  jsonLd: string | null;
}

export async function proposeSchema(input: SchemaInput): Promise<SchemaProposal> {
  const { client } = await getLLMClient();
  // Schema needs Opus — structurally precise long JSON output, Haiku makes
  // syntax mistakes here.
  const useModel = "claude-opus-4-7";
  const system = composeSystemPrompt("on_page", SCHEMA_PERSONA);
  const userPrompt = [
    `Generate ONE JSON-LD block for this page.`,
    ``,
    `Page URL: ${input.pageUrl}`,
    `Page type: ${input.pageType}`,
    `Title: "${input.title}"`,
    `H1: "${input.h1}"`,
    `Meta description: "${input.metaDescription}"`,
    `Body excerpt: ${input.bodyExcerpt.slice(0, 800)}`,
    `Site name: ${input.site.name}`,
    `Site domain: ${input.site.domain}`,
    input.site.city ? `City: ${input.site.city}` : "",
    input.site.region ? `Region: ${input.site.region}` : "",
    `Schema already present on this page: ${input.existingSchemaTypes.join(", ") || "(none)"}`,
    ``,
    `Choose ONE @type that fills a real gap (don't duplicate what's already on the page).`,
    `Preference order for a Dubai cleaning-services site:`,
    `  home → LocalBusiness (with additionalType "https://en.wikipedia.org/wiki/Cleaner") or HouseCleaning`,
    `  service → Service (with provider → LocalBusiness reference, category "cleaning services")`,
    `  city or neighbourhood → LocalBusiness with areaServed (Dubai + specific area, e.g. Palm Jumeirah, Dubai Marina, DIFC)`,
    `  article → Article`,
    `  faq → FAQPage`,
    `  contact → ContactPage + LocalBusiness reference`,
    `  about → AboutPage + Organization`,
    ``,
    `Return JSON:`,
    `  { "type": "...", "json_ld": { ...full schema.org object... } }`,
    `  { "skip": true, "reason": "..." }`,
    ``,
    `If you return json_ld, it must be a complete object including @context and @type. NO prose, NO code fences.`,
  ].filter(Boolean).join("\n");

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
  const proposal: SchemaProposal = {
    schemaType: null,
    jsonLd: null,
    model: useModel,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    durationMs,
    skipReason: null,
  };
  if (!parsed || typeof parsed !== "object") {
    proposal.skipReason = "parser-failed";
    return proposal;
  }
  if ((parsed as { skip?: unknown }).skip === true) {
    proposal.skipReason = String((parsed as { reason?: unknown }).reason ?? "model-declined");
    return proposal;
  }
  const type = (parsed as { type?: unknown }).type;
  const jsonLd = (parsed as { json_ld?: unknown }).json_ld;
  if (typeof type !== "string" || !jsonLd || typeof jsonLd !== "object") {
    proposal.skipReason = "shape-invalid";
    return proposal;
  }
  // Make sure the @context and @type are present.
  const ld = jsonLd as Record<string, unknown>;
  if (!ld["@context"]) ld["@context"] = "https://schema.org";
  if (!ld["@type"]) ld["@type"] = type;
  // Serialize and bound size — Google has no hard limit but anything > 8KB is a smell.
  const serialized = JSON.stringify(ld);
  if (serialized.length > 12_000) {
    proposal.skipReason = "schema-too-large";
    return proposal;
  }
  proposal.schemaType = type;
  proposal.jsonLd = serialized;
  return proposal;
}

// ─────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────

function parseShortProposal<T extends AgentProposalBase>(
  response: Anthropic.Message,
  durationMs: number,
  model: string,
  key: "title" | "description",
  minLen: number,
  maxLen: number,
): T {
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "";
  const parsed = safeParseJson(raw);
  const proposal = {
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    durationMs,
    skipReason: null as string | null,
    [key]: null as string | null,
  } as unknown as T;
  if (!parsed || typeof parsed !== "object") {
    (proposal as AgentProposalBase).skipReason = "parser-failed";
    return proposal;
  }
  if ((parsed as { skip?: unknown }).skip === true) {
    (proposal as AgentProposalBase).skipReason = String((parsed as { reason?: unknown }).reason ?? "model-declined");
    return proposal;
  }
  const v = (parsed as Record<string, unknown>)[key];
  if (typeof v !== "string" || v.trim().length === 0) {
    (proposal as AgentProposalBase).skipReason = "no-value-in-response";
    return proposal;
  }
  const clean = v.trim().replace(/\s+/g, " ");
  if (clean.length < minLen || clean.length > maxLen + 5) {
    (proposal as AgentProposalBase).skipReason = `length-${clean.length}-out-of-bounds`;
    return proposal;
  }
  (proposal as Record<string, unknown>)[key] = clean;
  return proposal;
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
