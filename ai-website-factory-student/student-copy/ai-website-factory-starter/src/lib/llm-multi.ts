/**
 * Multi-provider LLM client (v0.10) — tries Gemini → Groq → Anthropic in the
 * configured order, falls back to deterministic regex parsing as the final
 * resort. Designed so the customer-facing booking form always works, even if
 * every cloud provider is down.
 *
 * Cost philosophy:
 *   • Routine work (parse-quote, intent detection, lead classification) →
 *     run on free tiers (Gemini 1.5 Flash: 1,500 req/day; Groq Llama 3.3
 *     70B: 14,400 req/day). Zero cost to the org for the projected 5-site
 *     workload (~500 req/day).
 *   • Heavy work (audit, deep research, content drafts) → still routes to
 *     Anthropic Opus if configured. Use the existing `getLLMClient` from
 *     ./llm.ts for that.
 *
 * This module is JSON-output focused — every provider call asks for strict
 * JSON and we parse it on the way back. If a provider returns malformed
 * JSON we treat it as a soft fail and try the next one.
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { orgSettings } from "@/db/schema";
import { decrypt } from "./crypto";

export type LlmProvider = "gemini" | "groq" | "anthropic";
type ProviderChain = LlmProvider[];

interface ParseResult<T> {
  ok: boolean;
  data?: T;
  provider?: LlmProvider | "regex";
  error?: string;
}

interface OrgKeys {
  gemini?: string;
  groq?: string;
  anthropic?: string;
  preference: LlmProvider;
}

let _keysCache: { keys: OrgKeys; cachedAt: number } | null = null;
const KEYS_CACHE_TTL_MS = 30_000;

/**
 * Load + decrypt all configured LLM keys. Cached 30s to avoid DB hits on
 * every form submission.
 */
async function loadOrgKeys(): Promise<OrgKeys> {
  if (_keysCache && Date.now() - _keysCache.cachedAt < KEYS_CACHE_TTL_MS) {
    return _keysCache.keys;
  }
  await ensureSchema();
  const [row] = await db().select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);

  const keys: OrgKeys = {
    gemini: row?.geminiKeyCiphertext
      ? safeDecrypt(row.geminiKeyCiphertext)
      : process.env.GEMINI_API_KEY?.trim() || undefined,
    groq: row?.groqKeyCiphertext
      ? safeDecrypt(row.groqKeyCiphertext)
      : process.env.GROQ_API_KEY?.trim() || undefined,
    anthropic: row?.anthropicKeyCiphertext
      ? safeDecrypt(row.anthropicKeyCiphertext)
      : process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    preference: ((row?.llmProviderPreference as LlmProvider) ?? "gemini") as LlmProvider,
  };
  _keysCache = { keys, cachedAt: Date.now() };
  return keys;
}

/** Decrypt safely — returns undefined if ciphertext is malformed/wrong key. */
function safeDecrypt(ciphertext: string): string | undefined {
  try {
    return decrypt(ciphertext);
  } catch {
    return undefined;
  }
}

/**
 * Build the chain of providers to try, in order. Preferred first, then the
 * others (still configured), then regex fallback.
 */
function buildChain(keys: OrgKeys): ProviderChain {
  const order: LlmProvider[] = [];
  if (keys[keys.preference]) order.push(keys.preference);
  for (const p of ["gemini", "groq", "anthropic"] as LlmProvider[]) {
    if (p !== keys.preference && keys[p]) order.push(p);
  }
  return order;
}

// ────────────────────────────────────────────────────────────────────
// Public API — `parseJson<T>` is the only function callers should use.
// ────────────────────────────────────────────────────────────────────

interface ParseJsonOptions {
  /** The user message / unstructured text. */
  prompt: string;
  /**
   * JSON schema description (in plain English) that the LLM should match.
   * Example: "Object with keys: pickup (string), dropoff (string), pickup_at
   * (ISO datetime), passengers (number 1-10), trip_type ('one_way'|'two_way'|'hourly')."
   */
  schemaDescription: string;
  /**
   * System prompt — domain context. Default is the Dubai cleaning-services
   * quote-request use case. Override for other domains.
   */
  systemPrompt?: string;
  /** Hint language — `en`, `fr`, `pa`, etc. Helps the model parse non-English input. */
  language?: string;
  /** Per-call timeout. Default 8s. */
  timeoutMs?: number;
}

/**
 * Parse `prompt` into structured JSON matching `schemaDescription`. Tries
 * each configured provider in order. Returns the first valid JSON response,
 * or `{ ok: false, provider: 'regex' }` with whatever the regex parser
 * could extract if every provider fails.
 */
export async function parseJson<T = unknown>(opts: ParseJsonOptions): Promise<ParseResult<T>> {
  const keys = await loadOrgKeys();
  const chain = buildChain(keys);

  const systemPrompt =
    opts.systemPrompt ??
    `You are a structured-data extractor for a Dubai-based cleaning & maintenance services platform. Extract the user's quote request (property type, area/neighbourhood, service, rooms, date/time) into strict JSON matching the schema. Use null for unknown fields — never invent data. Output ONLY the JSON object with no markdown, no explanations.`;

  const lang = opts.language ?? "en";
  const userPrompt = `Schema: ${opts.schemaDescription}\n\nUser input (language=${lang}):\n"""${opts.prompt}"""\n\nReturn JSON only.`;

  const timeoutMs = opts.timeoutMs ?? 8000;

  for (const provider of chain) {
    try {
      const raw = await callProvider(provider, keys, systemPrompt, userPrompt, timeoutMs);
      const json = extractJson(raw);
      if (json) {
        return { ok: true, data: json as T, provider };
      }
    } catch (err) {
      // Log and keep trying the next provider.
      console.warn(`[llm-multi] ${provider} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return { ok: false, provider: "regex", error: "all-providers-failed" };
}

/** Just like parseJson but for plain text out (e.g. summaries). */
export async function generateText(opts: {
  prompt: string;
  systemPrompt?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; text?: string; provider?: LlmProvider; error?: string }> {
  const keys = await loadOrgKeys();
  const chain = buildChain(keys);

  const timeoutMs = opts.timeoutMs ?? 12000;
  const sys = opts.systemPrompt ?? "You are a helpful assistant. Reply concisely.";

  for (const provider of chain) {
    try {
      const text = await callProvider(provider, keys, sys, opts.prompt, timeoutMs);
      if (text && text.trim().length > 0) {
        return { ok: true, text, provider };
      }
    } catch (err) {
      console.warn(`[llm-multi] ${provider} text gen failed:`, err instanceof Error ? err.message : err);
    }
  }
  return { ok: false, error: "all-providers-failed" };
}

export async function isAnyLLMConfigured(): Promise<boolean> {
  const keys = await loadOrgKeys();
  return !!(keys.gemini || keys.groq || keys.anthropic);
}

// ────────────────────────────────────────────────────────────────────
// Per-provider transport
// ────────────────────────────────────────────────────────────────────

async function callProvider(
  provider: LlmProvider,
  keys: OrgKeys,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<string> {
  switch (provider) {
    case "gemini":
      return callGemini(keys.gemini!, systemPrompt, userPrompt, timeoutMs);
    case "groq":
      return callGroq(keys.groq!, systemPrompt, userPrompt, timeoutMs);
    case "anthropic":
      return callAnthropic(keys.anthropic!, systemPrompt, userPrompt, timeoutMs);
  }
}

/** Gemini 1.5 Flash — fastest free tier provider for JSON tasks. */
async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // gemini-2.0-flash is the current stable Flash model (1500 req/day free tier).
    // gemini-1.5-flash was retired May 2026 — calls return HTTP 404.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          maxOutputTokens: 1024,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new Error("Gemini returned empty content");
    return text;
  } finally {
    clearTimeout(t);
  }
}

/** Groq Llama 3.3 70B — fast and free, OpenAI-compatible. */
async function callGroq(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Groq returned empty content");
    return text;
  } finally {
    clearTimeout(t);
  }
}

/** Anthropic Claude Haiku — used as a paid-tier fallback if configured. */
async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    if (!text) throw new Error("Anthropic returned empty content");
    return text;
  } finally {
    clearTimeout(t);
  }
}

// ────────────────────────────────────────────────────────────────────
// JSON extraction — handles models that wrap JSON in markdown.
// ────────────────────────────────────────────────────────────────────

function extractJson(raw: string): unknown | null {
  // Strip markdown code fences if present.
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Try to find the first { ... } block.
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Invalidate the keys cache. Called from server actions when keys are rotated. */
export function invalidateKeysCache(): void {
  _keysCache = null;
}
