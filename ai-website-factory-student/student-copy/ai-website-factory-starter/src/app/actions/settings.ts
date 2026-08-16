"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { integrationsAccounts, orgSettings, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { encrypt } from "@/lib/crypto";
import { resetSmtpCache, sendMail } from "@/lib/email";
import { validateApiKey } from "@/lib/llm";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function saveAnthropicKeyAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const apiKey = s(formData, "apiKey");
  if (!apiKey.startsWith("sk-ant-")) {
    redirect("/admin/settings?error=bad-format");
  }
  if (apiKey.length < 50) {
    redirect("/admin/settings?error=bad-format");
  }

  const validation = await validateApiKey(apiKey);
  if (!validation.ok) {
    redirect(`/admin/settings?error=invalid&detail=${encodeURIComponent(validation.reason)}`);
  }

  const ciphertext = encrypt(apiKey, "anthropic_key");
  await db()
    .update(orgSettings)
    .set({ anthropicKeyCiphertext: ciphertext, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));

  await recordAdminAction({
    actor: me,
    kind: "org.anthropic_key_rotate",
    targetType: "org",
    targetId: "singleton",
    summary: `Rotated Anthropic API key (last 4 = …${apiKey.slice(-4)})`,
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=key-saved");
}

// ───────────────────────────────────────────────────────────────────────
// Multi-provider LLM keys (v0.10) — Gemini + Groq give free-tier fallback.
// ───────────────────────────────────────────────────────────────────────

/**
 * Validate a Gemini key by calling the lightest possible endpoint:
 * `models.list`. Returns ok/reason without burning quota on actual generation.
 */
async function validateGeminiKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: "GET", signal: AbortSignal.timeout(10_000) },
    );
    if (res.ok) return { ok: true };
    if (res.status === 400 || res.status === 403) return { ok: false, reason: "Invalid Gemini key (rejected by Google)" };
    return { ok: false, reason: `Gemini API returned ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg.slice(0, 240) };
  }
}

/**
 * Validate a Groq key by listing models. Free tier, no quota burn.
 */
async function validateGroqKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, reason: "Invalid Groq key" };
    return { ok: false, reason: `Groq API returned ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg.slice(0, 240) };
  }
}

export async function saveGeminiKeyAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const apiKey = s(formData, "apiKey");
  // Google Gemini keys start with "AIza" and are ~39 chars.
  if (!apiKey.startsWith("AIza") || apiKey.length < 30) {
    redirect("/admin/settings?error=bad-gemini-format");
  }

  const validation = await validateGeminiKey(apiKey);
  if (!validation.ok) {
    redirect(`/admin/settings?error=invalid&detail=${encodeURIComponent(validation.reason)}`);
  }

  const ciphertext = encrypt(apiKey, "gemini_key");
  await db()
    .update(orgSettings)
    .set({ geminiKeyCiphertext: ciphertext, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));

  await recordAdminAction({
    actor: me,
    kind: "org.gemini_key_rotate",
    targetType: "org",
    targetId: "singleton",
    summary: `Saved Google Gemini API key (last 4 = …${apiKey.slice(-4)})`,
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=gemini-key-saved");
}

export async function clearGeminiKeyAction() {
  await ensureSchema();
  const me = await requireAdmin();
  await db()
    .update(orgSettings)
    .set({ geminiKeyCiphertext: null, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));
  await recordAdminAction({
    actor: me,
    kind: "org.gemini_key_clear",
    targetType: "org",
    targetId: "singleton",
    summary: "Cleared Google Gemini API key",
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=gemini-key-cleared");
}

export async function saveGroqKeyAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const apiKey = s(formData, "apiKey");
  // Groq keys start with "gsk_" and are ~56 chars.
  if (!apiKey.startsWith("gsk_") || apiKey.length < 30) {
    redirect("/admin/settings?error=bad-groq-format");
  }

  const validation = await validateGroqKey(apiKey);
  if (!validation.ok) {
    redirect(`/admin/settings?error=invalid&detail=${encodeURIComponent(validation.reason)}`);
  }

  const ciphertext = encrypt(apiKey, "groq_key");
  await db()
    .update(orgSettings)
    .set({ groqKeyCiphertext: ciphertext, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));

  await recordAdminAction({
    actor: me,
    kind: "org.groq_key_rotate",
    targetType: "org",
    targetId: "singleton",
    summary: `Saved Groq API key (last 4 = …${apiKey.slice(-4)})`,
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=groq-key-saved");
}

export async function clearGroqKeyAction() {
  await ensureSchema();
  const me = await requireAdmin();
  await db()
    .update(orgSettings)
    .set({ groqKeyCiphertext: null, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));
  await recordAdminAction({
    actor: me,
    kind: "org.groq_key_clear",
    targetType: "org",
    targetId: "singleton",
    summary: "Cleared Groq API key",
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=groq-key-cleared");
}

export async function updateLlmProviderPreferenceAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const pref = s(formData, "provider");
  if (!["gemini", "groq", "anthropic"].includes(pref)) {
    redirect("/admin/settings?error=bad-provider-preference");
  }
  await db()
    .update(orgSettings)
    .set({ llmProviderPreference: pref, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=provider-preference-saved");
}

export async function clearAnthropicKeyAction() {
  await ensureSchema();
  const me = await requireAdmin();
  await db()
    .update(orgSettings)
    .set({ anthropicKeyCiphertext: null, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));
  await recordAdminAction({
    actor: me,
    kind: "org.anthropic_key_clear",
    targetType: "org",
    targetId: "singleton",
    summary: "Cleared Anthropic API key",
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=key-cleared");
}

// ───────────────────────────────────────────────────────────────────────
// Technical Scout API keys (2026-06-25) — PageSpeed Insights + CrUX. BYOK,
// same ciphertext pattern as above. Configuring these moves PSI off the
// unauthenticated ~25 req/100s tier (root cause of the Tech Watchdog 429s)
// and lets the CWV cron pull real-user CrUX data instead of failing closed.
// ───────────────────────────────────────────────────────────────────────

async function validatePagespeedKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent("https://example.com")}&category=performance&key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (res.ok) return { ok: true };
    if (res.status === 400 || res.status === 403) return { ok: false, reason: "Invalid PageSpeed key (rejected by Google)" };
    return { ok: false, reason: `PageSpeed API returned ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg.slice(0, 240) };
  }
}

async function validateCruxKey(apiKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "https://example.com" }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    // 404 = no CrUX data for example.com, which still proves the key works.
    if (res.ok || res.status === 404) return { ok: true };
    if (res.status === 400 || res.status === 403) return { ok: false, reason: "Invalid CrUX key (rejected by Google)" };
    return { ok: false, reason: `CrUX API returned ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg.slice(0, 240) };
  }
}

export async function savePagespeedKeyAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const apiKey = s(formData, "apiKey");
  if (!apiKey.startsWith("AIza") || apiKey.length < 30) {
    redirect("/admin/settings?section=apis&error=bad-pagespeed-format");
  }

  const validation = await validatePagespeedKey(apiKey);
  if (!validation.ok) {
    redirect(`/admin/settings?section=apis&error=invalid&detail=${encodeURIComponent(validation.reason)}`);
  }

  await db()
    .update(orgSettings)
    .set({ pagespeedApiKeyCiphertext: encrypt(apiKey, "pagespeed_key"), updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));

  await recordAdminAction({
    actor: me,
    kind: "org.pagespeed_key_rotate",
    targetType: "org",
    targetId: "singleton",
    summary: `Saved PageSpeed Insights API key (last 4 = …${apiKey.slice(-4)})`,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/tech-watchdog");
  revalidatePath("/admin/cwv");
  redirect("/admin/settings?section=apis&ok=pagespeed-key-saved");
}

export async function clearPagespeedKeyAction() {
  await ensureSchema();
  const me = await requireAdmin();
  await db()
    .update(orgSettings)
    .set({ pagespeedApiKeyCiphertext: null, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));
  await recordAdminAction({
    actor: me,
    kind: "org.pagespeed_key_clear",
    targetType: "org",
    targetId: "singleton",
    summary: "Cleared PageSpeed Insights API key",
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?section=apis&ok=pagespeed-key-cleared");
}

export async function saveCruxKeyAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const apiKey = s(formData, "apiKey");
  if (!apiKey.startsWith("AIza") || apiKey.length < 30) {
    redirect("/admin/settings?section=apis&error=bad-crux-format");
  }

  const validation = await validateCruxKey(apiKey);
  if (!validation.ok) {
    redirect(`/admin/settings?section=apis&error=invalid&detail=${encodeURIComponent(validation.reason)}`);
  }

  await db()
    .update(orgSettings)
    .set({ googleCruxApiKeyCiphertext: encrypt(apiKey, "google_crux_key"), updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));

  await recordAdminAction({
    actor: me,
    kind: "org.crux_key_rotate",
    targetType: "org",
    targetId: "singleton",
    summary: `Saved Chrome UX Report API key (last 4 = …${apiKey.slice(-4)})`,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/cwv");
  redirect("/admin/settings?section=apis&ok=crux-key-saved");
}

export async function clearCruxKeyAction() {
  await ensureSchema();
  const me = await requireAdmin();
  await db()
    .update(orgSettings)
    .set({ googleCruxApiKeyCiphertext: null, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));
  await recordAdminAction({
    actor: me,
    kind: "org.crux_key_clear",
    targetType: "org",
    targetId: "singleton",
    summary: "Cleared Chrome UX Report API key",
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?section=apis&ok=crux-key-cleared");
}

export async function saveIndexnowQuotaAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const raw = s(formData, "quota");
  const quota = Number(raw);
  if (!Number.isInteger(quota) || quota < 1 || quota > 10_000) {
    redirect("/admin/settings?section=apis&error=bad-indexnow-quota");
  }

  await db()
    .update(orgSettings)
    .set({ indexnowDailyQuota: quota, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));

  revalidatePath("/admin/settings");
  revalidatePath("/admin/index-tracker");
  revalidatePath("/admin/indexing");
  redirect("/admin/settings?section=apis&ok=indexnow-quota-saved");
}

export async function updateLlmSettingsAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const model = s(formData, "model") || "claude-opus-4-7";
  const auditEnabled = formData.get("auditEnabled") === "on";
  const digestEnabled = formData.get("digestEnabled") === "on";

  await db()
    .update(orgSettings)
    .set({ llmModel: model, auditEnabled, digestEnabled, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));
  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=settings-saved");
}

export async function saveIntegrationCredsAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const provider = s(formData, "provider");
  if (!["stripe", "square", "google", "twilio"].includes(provider)) {
    redirect("/admin/settings?section=integrations&error=bad-provider");
  }

  const updates: Record<string, string | null> = {};
  if (provider === "stripe") {
    const clientId = s(formData, "stripe_client_id");
    const secret = s(formData, "stripe_secret");
    if (clientId) updates.stripeOauthClientId = clientId;
    if (secret) updates.stripeOauthSecretCiphertext = encrypt(secret, "stripe_secret");
  } else if (provider === "square") {
    const clientId = s(formData, "square_client_id");
    const secret = s(formData, "square_secret");
    if (clientId) updates.squareOauthClientId = clientId;
    if (secret) updates.squareOauthSecretCiphertext = encrypt(secret, "square_secret");
  } else if (provider === "google") {
    const clientId = s(formData, "google_client_id");
    const secret = s(formData, "google_secret");
    if (clientId) updates.googleOauthClientId = clientId;
    if (secret) updates.googleOauthSecretCiphertext = encrypt(secret, "google_secret");
  } else if (provider === "twilio") {
    const sid = s(formData, "twilio_sid");
    const token = s(formData, "twilio_token");
    const baseUrl = s(formData, "twilio_webhook_base_url");
    if (sid) updates.twilioAccountSid = sid;
    if (token) updates.twilioAuthTokenCiphertext = encrypt(token, "twilio_token");
    if (baseUrl) updates.twilioWebhookBaseUrl = baseUrl;
  }

  if (Object.keys(updates).length === 0) {
    redirect("/admin/settings?section=integrations&error=nothing-to-save");
  }

  await db()
    .update(orgSettings)
    .set({ ...updates, updatedAt: new Date(), updatedBy: me.id })
    .where(eq(orgSettings.id, "singleton"));
  await recordAdminAction({
    actor: me,
    kind: `org.${provider}_creds_update`,
    targetType: "org",
    targetId: "singleton",
    summary: `Updated ${provider} OAuth credentials (${Object.keys(updates).join(", ")})`,
  });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?section=integrations&ok=integration-saved&provider=${provider}`);
}

export async function saveSmtpSettingsAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const host = s(formData, "smtp_host");
  const portRaw = s(formData, "smtp_port");
  const user = s(formData, "smtp_user");
  const password = s(formData, "smtp_password"); // optional on edits: blank = keep existing
  const from = s(formData, "smtp_from");
  const enabled = formData.get("smtp_enabled") === "on";
  const publicBaseUrl = s(formData, "public_base_url");
  const providerName = s(formData, "smtp_provider_name");

  const port = portRaw ? Number.parseInt(portRaw, 10) : null;
  if (portRaw && (!Number.isFinite(port) || port! < 1 || port! > 65535)) {
    redirect("/admin/settings?section=integrations&error=smtp-bad-port");
  }

  const updates: Record<string, unknown> = {
    smtpHost: host || null,
    smtpPort: port,
    smtpUser: user || null,
    smtpFrom: from || null,
    smtpEnabled: enabled,
    smtpProviderName: providerName || null,
    publicBaseUrl: publicBaseUrl || null,
    updatedAt: new Date(),
    updatedBy: me.id,
  };
  if (password) {
    updates.smtpPasswordCiphertext = encrypt(password, "smtp_password");
  }

  await db().update(orgSettings).set(updates).where(eq(orgSettings.id, "singleton"));
  resetSmtpCache();

  await recordAdminAction({
    actor: me,
    kind: "org.smtp_update",
    targetType: "org",
    targetId: "singleton",
    summary: `Updated SMTP settings (enabled=${enabled}, host=${host || "—"})`,
    after: { smtpHost: host, smtpPort: port, smtpUser: user, smtpFrom: from, smtpEnabled: enabled, passwordRotated: !!password },
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?section=integrations&ok=smtp-saved");
}

/**
 * Set or update the GA4 property_id stored in
 * `integrations_accounts.metadata.ga4_property_id`. Accepts either the bare
 * numeric id (e.g. "312345678") or the API form ("properties/312345678") and
 * normalises to the API form which `sync-ga4.ts` expects.
 */
export async function updateGa4PropertyIdAction(siteId: string, propertyIdRaw: string) {
  await ensureSchema();
  const me = await requireAdmin();

  const trimmed = (propertyIdRaw ?? "").trim();
  let normalised = trimmed;
  if (/^\d+$/.test(trimmed)) normalised = `properties/${trimmed}`;
  if (trimmed && !/^properties\/\d+$/.test(normalised)) {
    redirect(`/admin/sites?error=${encodeURIComponent("ga4-bad-property-id")}`);
  }

  const [site] = await db().select({ slug: sites.slug }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) redirect("/admin/sites?error=site-not-found");

  const [before] = await db()
    .select({ id: integrationsAccounts.id, metadata: integrationsAccounts.metadata })
    .from(integrationsAccounts)
    .where(and(eq(integrationsAccounts.siteId, siteId), eq(integrationsAccounts.provider, "google")))
    .limit(1);

  // The property id is useless without a Google access token — GA4 sync will
  // fail immediately on any run. Fail loudly here so the operator connects
  // Google first instead of getting a silent no-op UPDATE (0 rows affected).
  if (!before) {
    redirect(`/admin/sites/${site.slug}?error=ga4-google-not-connected`);
  }

  await db()
    .update(integrationsAccounts)
    .set({
      metadata: sql`jsonb_set(coalesce(${integrationsAccounts.metadata}, '{}'::jsonb), '{ga4_property_id}', to_jsonb(${normalised}::text), true)`,
      updatedAt: new Date(),
    })
    .where(and(eq(integrationsAccounts.siteId, siteId), eq(integrationsAccounts.provider, "google")));

  await recordAdminAction({
    actor: me,
    kind: "integration.ga4_property_id_set",
    targetType: "integration",
    targetId: `${site.slug}:google`,
    summary: `Set GA4 property_id to ${normalised || "(cleared)"} on ${site.slug}`,
    before: before?.metadata ?? null,
    after: { ga4_property_id: normalised },
  });

  revalidatePath(`/admin/sites/${site.slug}`);
  redirect(`/admin/sites/${site.slug}?ok=ga4-saved`);
}

/**
 * Save the network-wide AI knowledge base. Applied to every site's chat
 * widget + smart-quote parser before the per-site KB. Used to express
 * facts that hold across the whole network (e.g. "we serve Dubai + all UAE emirates,
 * here is the AED pricing floor, here is the network cancellation policy").
 *
 * Hard limit 16 KB so the token budget stays bounded even after we stack
 * it with each site's per-site KB. The UI warns past 12 KB.
 */
export async function saveNetworkKnowledgeAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();
  const raw = (formData.get("network_knowledge_base") ?? "").toString();
  const networkKnowledgeBase = raw.trim().slice(0, 16384) || null;

  // Upsert org_settings singleton — same pattern as the other settings actions.
  await db()
    .insert(orgSettings)
    .values({ id: "singleton", networkKnowledgeBase, updatedAt: new Date(), updatedBy: me.id })
    .onConflictDoUpdate({
      target: orgSettings.id,
      set: { networkKnowledgeBase, updatedAt: new Date(), updatedBy: me.id },
    });

  await recordAdminAction({
    actor: me,
    kind: "org.network_knowledge_update",
    targetType: "other",
    targetId: "org_settings",
    summary: `Updated network-wide AI knowledge (${networkKnowledgeBase?.length ?? 0} chars)`,
    after: { length: networkKnowledgeBase?.length ?? 0 },
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?ok=network-kb-saved");
}

/**
 * Save a Telegram bot token. Validates with getMe(), generates a webhook
 * secret if one doesn't exist yet, and registers the webhook with Telegram
 * pointing at /api/integrations/telegram/webhook on PUBLIC_BASE_URL.
 *
 * The token format is `<botId>:<random>` from @BotFather. We don't allow
 * pasting blanks (use clearTelegramBotAction for that).
 */
export async function saveTelegramBotAction(formData: FormData) {
  await ensureSchema();
  const me = await requireAdmin();

  const token = s(formData, "telegramBotToken");
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    redirect("/admin/settings?section=integrations&error=bad-telegram-format");
  }

  const [orgRow] = await db().select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);
  if (!orgRow?.publicBaseUrl) {
    redirect("/admin/settings?section=integrations&error=public-base-url-missing");
  }

  // Probe getMe to validate token + capture bot username.
  let botUsername: string | null = null;
  try {
    const probe = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await probe.json()) as { ok: boolean; result?: { username?: string }; description?: string };
    if (!j.ok) {
      redirect(`/admin/settings?section=integrations&error=invalid-telegram&detail=${encodeURIComponent(j.description ?? "unknown")}`);
    }
    botUsername = j.result?.username ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/admin/settings?section=integrations&error=telegram-network&detail=${encodeURIComponent(msg)}`);
  }

  // Reuse the existing webhook secret if present so re-saving the token
  // doesn't invalidate active links.
  const webhookSecret =
    orgRow.telegramWebhookSecret && orgRow.telegramWebhookSecret.length >= 32
      ? orgRow.telegramWebhookSecret
      : require("node:crypto").randomBytes(24).toString("base64url");

  const ciphertext = encrypt(token, "telegram_bot_token");

  await db()
    .update(orgSettings)
    .set({
      telegramBotTokenCiphertext: ciphertext,
      telegramWebhookSecret: webhookSecret,
      telegramBotUsername: botUsername,
      updatedAt: new Date(),
      updatedBy: me.id,
    })
    .where(eq(orgSettings.id, "singleton"));

  // Register the webhook with Telegram now that the token + secret are saved.
  try {
    const url = `${orgRow.publicBaseUrl.replace(/\/$/, "")}/api/integrations/telegram/webhook?s=${webhookSecret}`;
    const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        allowed_updates: ["message"],
        drop_pending_updates: false,
        secret_token: webhookSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await resp.json()) as { ok: boolean; description?: string };
    if (!j.ok) {
      redirect(`/admin/settings?section=integrations&error=webhook-failed&detail=${encodeURIComponent(j.description ?? "unknown")}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    redirect(`/admin/settings?section=integrations&error=webhook-network&detail=${encodeURIComponent(msg)}`);
  }

  await recordAdminAction({
    actor: me,
    kind: "org.telegram_bot_set",
    targetType: "org",
    targetId: "singleton",
    summary: `Telegram bot @${botUsername ?? "unknown"} connected; webhook registered.`,
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?section=integrations&telegram=connected");
}

/** Clear the Telegram bot token + un-register its webhook. */
export async function clearTelegramBotAction() {
  await ensureSchema();
  const me = await requireAdmin();
  const [orgRow] = await db().select().from(orgSettings).where(eq(orgSettings.id, "singleton")).limit(1);
  if (orgRow?.telegramBotTokenCiphertext) {
    try {
      const { decrypt } = await import("@/lib/crypto");
      const token = decrypt(orgRow.telegramBotTokenCiphertext);
      await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {});
    } catch {
      // best-effort
    }
  }
  await db()
    .update(orgSettings)
    .set({
      telegramBotTokenCiphertext: null,
      telegramWebhookSecret: null,
      telegramBotUsername: null,
      updatedAt: new Date(),
      updatedBy: me.id,
    })
    .where(eq(orgSettings.id, "singleton"));
  await recordAdminAction({
    actor: me,
    kind: "org.telegram_bot_cleared",
    targetType: "org",
    targetId: "singleton",
    summary: "Telegram bot disconnected.",
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?section=integrations&telegram=cleared");
}

export async function sendTestEmailAction() {
  await ensureSchema();
  const me = await requireAdmin();
  if (!me.email) redirect("/admin/settings?section=integrations&error=smtp-no-email");
  const result = await sendMail({
    to: me.email,
    subject: "[GYL] SMTP test email",
    text: `Hi ${me.name ?? me.email},\n\nThis is a test message from your GYL Platform.\nIf you're reading this, outbound SMTP is wired up correctly.\n\n— GYL Platform`,
  });
  if (!result.ok) {
    redirect(`/admin/settings?section=integrations&error=smtp-test-failed&detail=${encodeURIComponent(result.error ?? "unknown")}`);
  }
  redirect("/admin/settings?section=integrations&ok=smtp-test-sent");
}
