import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { orgSettings } from "@/db/schema";
import { decrypt } from "./crypto";

/**
 * BYOK Anthropic client + per-task model routing.
 *
 * Single API key per org (singleton row in org_settings or
 * `ANTHROPIC_API_KEY` env). Different task types route to different
 * models so you don't pay Opus rates for a meta-title rewrite while
 * still getting Opus on the work that matters (deep audits, research,
 * long-form content drafts, design generation, critic-LLM judgment).
 *
 * Defaults are sensible but env-overridable:
 *   ANTHROPIC_MODEL_HEAVY    (default: claude-opus-4-7)
 *   ANTHROPIC_MODEL_STANDARD (default: claude-sonnet-4-5)
 *   ANTHROPIC_MODEL_CHEAP    (default: claude-haiku-4-5)
 *
 * UI-stored model in org_settings.llm_model overrides the HEAVY default.
 */

export class LLMNotConfiguredError extends Error {
  constructor() {
    super(
      "Anthropic API key is not configured. Admin must set it at /admin/settings.",
    );
    this.name = "LLMNotConfiguredError";
  }
}

export type TaskTier = "heavy" | "standard" | "cheap";

/**
 * Map of task tier → model. Heavy is overridable from the UI
 * (`org_settings.llm_model`) so the user can pin Opus or downgrade.
 * Standard + cheap are env-only (rare you'd want them in the UI).
 */
export function modelForTier(tier: TaskTier, uiHeavyOverride?: string | null): string {
  switch (tier) {
    case "heavy":
      return uiHeavyOverride || process.env.ANTHROPIC_MODEL_HEAVY || "claude-opus-4-7";
    case "standard":
      return process.env.ANTHROPIC_MODEL_STANDARD || "claude-sonnet-4-5";
    case "cheap":
      return process.env.ANTHROPIC_MODEL_CHEAP || "claude-haiku-4-5";
  }
}

let _cachedClient: { fingerprint: string; client: Anthropic } | null = null;

async function loadSettings() {
  await ensureSchema();
  const [row] = await db().select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);
  return row;
}

/**
 * Resolve the Anthropic client + model for a given task tier.
 *
 * For backward compatibility, callers can omit `tier` — they'll get the
 * heavy tier (whatever's set in org_settings.llm_model or the env
 * default). New callers should always pass a tier so cost scales right.
 */
export async function getLLMClient(opts?: { tier?: TaskTier }): Promise<{ client: Anthropic; model: string; tier: TaskTier }> {
  const tier: TaskTier = opts?.tier ?? "heavy";

  const row = await loadSettings();
  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  const apiKey = row?.anthropicKeyCiphertext
    ? decrypt(row.anthropicKeyCiphertext)
    : envKey || null;
  if (!apiKey) throw new LLMNotConfiguredError();

  const model = modelForTier(tier, row?.llmModel);

  const fingerprint = apiKey.slice(0, 24);
  if (_cachedClient?.fingerprint === fingerprint) {
    return { client: _cachedClient.client, model, tier };
  }
  const client = new Anthropic({ apiKey });
  _cachedClient = { fingerprint, client };
  return { client, model, tier };
}

export async function isLLMConfigured(): Promise<boolean> {
  const row = await loadSettings();
  if (row?.anthropicKeyCiphertext) return true;
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export async function getAuditAndDigestFlags() {
  const row = await loadSettings();
  return {
    auditEnabled: row?.auditEnabled ?? true,
    digestEnabled: row?.digestEnabled ?? true,
    configured: !!row?.anthropicKeyCiphertext || !!process.env.ANTHROPIC_API_KEY?.trim(),
  };
}

/**
 * Quick validation — make a tiny request to verify the API key works before
 * saving. Catches "wrong account", "revoked key", etc. before any real usage.
 */
export async function validateApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const probe = new Anthropic({ apiKey });
    await probe.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: "Invalid API key" };
    if (err instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, reason: "API key valid but lacks permission" };
    }
    if (err instanceof Anthropic.APIError) return { ok: false, reason: `Anthropic ${err.status}: ${err.message}` };
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg.slice(0, 240) };
  }
}
