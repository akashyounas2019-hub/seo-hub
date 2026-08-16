import Link from "next/link";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { orgSettings, users } from "@/db/schema";
import {
  clearAnthropicKeyAction,
  clearGeminiKeyAction,
  clearGroqKeyAction,
  saveAnthropicKeyAction,
  saveGeminiKeyAction,
  saveGroqKeyAction,
  saveIntegrationCredsAction,
  clearTelegramBotAction,
  saveNetworkKnowledgeAction,
  saveSmtpSettingsAction,
  saveTelegramBotAction,
  sendTestEmailAction,
  updateLlmProviderPreferenceAction,
  updateLlmSettingsAction,
  savePagespeedKeyAction,
  clearPagespeedKeyAction,
  saveCruxKeyAction,
  clearCruxKeyAction,
  saveIndexnowQuotaAction,
} from "@/app/actions/settings";
import { DEFAULT_NETWORK_KB } from "@/lib/ai-knowledge";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { SettingsTabs } from "@/components/ui/SettingsTabs";
import type { SettingsSection } from "@/components/ui/SettingsSubTabs";
import { SendTestPushButton } from "./SendTestPushButton";
import { IntegrationToggle } from "./IntegrationToggle";

export const dynamic = "force-dynamic";

function ProviderForm({
  title,
  provider,
  hasCreds,
  fields,
  hint,
}: {
  title: string;
  provider: "google";
  hasCreds: boolean;
  /** `currentValue` is only ever a non-secret field (client id, SID, URL) —
   *  password-type fields never echo back the stored secret. Shown as the
   *  input's placeholder so the field reads as "configured: <value>" without
   *  putting it in an editable value the admin could accidentally re-submit
   *  blank-but-changed. */
  fields: { name: string; label: string; type: string; currentValue?: string | null; secretSet?: boolean }[];
  hint?: React.ReactNode;
}) {
  return (
    <form
      action={saveIntegrationCredsAction}
      className="mt-4 rounded-lg border border-border bg-surface p-3"
    >
      <input type="hidden" name="provider" value={provider} />
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        {hasCreds ? (
          <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium uppercase text-success ring-1 ring-success/30">
            configured
          </span>
        ) : (
          <span className="rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium uppercase text-danger ring-1 ring-danger/30">
            not set
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="block text-xs uppercase tracking-wide text-text-muted">
              {f.label}
              {f.currentValue || f.secretSet ? <span className="ml-1.5 text-text-faint">· currently set</span> : null}
            </span>
            <input
              name={f.name}
              type={f.type}
              autoComplete="off"
              placeholder={f.currentValue ? f.currentValue : f.secretSet ? "•••••••• (leave blank to keep current)" : undefined}
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
        ))}
      </div>
      {hint ? <p className="mt-2 text-xs text-text-muted">{hint}</p> : null}
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
        >
          Save
        </button>
      </div>
    </form>
  );
}

const MODEL_OPTIONS = [
  { id: "claude-opus-4-7", label: "Opus 4.7 — most capable (recommended)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — faster + cheaper" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — cheapest, simplest tasks only" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string; detail?: string; section?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const [settings] = await d
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.id, "singleton"))
    .limit(1);

  let updatedByEmail: string | null = null;
  if (settings?.updatedBy) {
    const [u] = await d.select({ email: users.email }).from(users).where(eq(users.id, settings.updatedBy)).limit(1);
    updatedByEmail = u?.email ?? null;
  }

  const hasKey = !!settings?.anthropicKeyCiphertext;
  const hasGeminiKey = !!settings?.geminiKeyCiphertext;
  const hasGroqKey = !!settings?.groqKeyCiphertext;
  const hasPagespeedKey = !!settings?.pagespeedApiKeyCiphertext;
  const hasCruxKey = !!settings?.googleCruxApiKeyCiphertext;
  const providerPref = settings?.llmProviderPreference ?? "gemini";

  // Redirect URI the admin must paste into Google Cloud Console when creating
  // the OAuth client. Derived from PUBLIC_BASE_URL, or the incoming request's
  // host as a fallback (so it just works in local dev without env vars).
  const h = headers();
  const inferredOrigin =
    process.env.PUBLIC_BASE_URL ??
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3001"}`;
  const googleRedirectUri = `${inferredOrigin.replace(/\/$/, "")}/api/integrations/google/callback`;

  const section = (["general", "apis", "integrations"].includes(searchParams.section ?? "") ? searchParams.section : "general") as SettingsSection;

  const activeTab = section === "general" ? "general" : section === "apis" ? "apis" : "integrations";

  return (
    <div>
      <SettingsTabs active={activeTab} />

      <div>
        <h1 className="text-2xl font-medium tracking-tightish text-text">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          {section === "apis" ? "API keys for LLM providers. All keys are encrypted (AES-256-GCM) and never logged." :
           section === "integrations" ? "Connections to payment, analytics, messaging, and site providers. Toggle each on to configure." :
           "Model preferences, AI features, and network-wide configuration."}
        </p>
      </div>

      {/* Integration-save confirmations (integration-saved, smtp-saved, smtp-test-sent)
          show as the global <Toast> popup instead of this inline banner — see
          INTEGRATION_TOAST_MESSAGES in components/ui/Toast.tsx. */}
      {searchParams.ok && !["integration-saved", "smtp-saved", "smtp-test-sent"].includes(searchParams.ok) ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          {{
            "key-saved": "Anthropic API key saved and validated.",
            "key-cleared": "Anthropic API key removed.",
            "gemini-key-saved": "Google Gemini API key saved and validated. Free tier active.",
            "gemini-key-cleared": "Gemini API key removed.",
            "groq-key-saved": "Groq API key saved and validated. Free tier active.",
            "groq-key-cleared": "Groq API key removed.",
            "provider-preference-saved": "Provider preference updated.",
            "settings-saved": "Settings updated.",
            "network-kb-saved": "Network-wide AI knowledge saved. New customer chats across all sites will use the updated context.",
          }[searchParams.ok] ?? searchParams.ok}
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
          {{
            "bad-format": "Anthropic key must start with 'sk-ant-' and be at least 50 characters.",
            "bad-gemini-format": "Gemini key must start with 'AIza' (Google API key format).",
            "bad-groq-format": "Groq key must start with 'gsk_'.",
            "bad-provider-preference": "Provider preference must be gemini / groq / anthropic.",
            invalid: `Provider rejected this key: ${searchParams.detail ?? ""}`,
            "smtp-bad-port": "SMTP port must be between 1 and 65535.",
            "smtp-no-email": "Your account has no email address — can't send a test.",
            "smtp-test-failed": `SMTP test failed: ${searchParams.detail ?? ""}`,
          }[searchParams.error] ?? searchParams.error}
        </div>
      ) : null}

      {section === "apis" && (
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {/* ── Gemini (FREE — 1,500 reqs/day) ──────────────────────────── */}
      <section className="rounded-xl border border-success/40 bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Google Gemini API key
          </h2>
          <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-success ring-1 ring-success/30">
            Free · Recommended
          </span>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Free tier: <strong>1,500 requests/day</strong> on Gemini 1.5 Flash. Covers all routine
          form parsing across 5+ sites. Get a key in 30 seconds.
        </p>

        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="font-mono text-xs">
            Status:{" "}
            {hasGeminiKey ? (
              <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium uppercase text-success ring-1 ring-success/30">
                configured
              </span>
            ) : (
              <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium uppercase text-warning ring-1 ring-warning/30">
                not set
              </span>
            )}
          </span>
        </div>

        <form action={saveGeminiKeyAction} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
              {hasGeminiKey ? "Replace Gemini API key" : "Paste your Gemini API key"}
            </span>
            <input
              name="apiKey"
              type="password"
              required
              autoComplete="off"
              placeholder="AIzaSy..."
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <span className="mt-1 block text-xs text-text-muted">
              1. Open{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                aistudio.google.com/apikey
              </a>
              {" "}· 2. Sign in with Google · 3. Click <strong>Create API key → Create in new project</strong> · 4. Copy and paste here.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
            >
              Save + validate
            </button>
          </div>
        </form>

        {hasGeminiKey ? (
          <form action={clearGeminiKeyAction} className="mt-3 border-t border-border pt-3">
            <button type="submit" className="text-xs text-danger hover:underline">
              Remove the stored Gemini key
            </button>
          </form>
        ) : null}
      </section>

      {/* ── Groq (FREE — 14,400 reqs/day, optional backup) ──────────── */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Groq API key
          </h2>
          <span className="rounded-full bg-info-tint px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-info ring-1 ring-info/30">
            Free · Optional backup
          </span>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Free tier: <strong>14,400 requests/day</strong> on Llama 3.3 70B. Used automatically if
          Gemini quota is exhausted. You probably won&apos;t hit Gemini&apos;s limit for years —
          this is belt &amp; suspenders.
        </p>

        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="font-mono text-xs">
            Status:{" "}
            {hasGroqKey ? (
              <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium uppercase text-success ring-1 ring-success/30">
                configured
              </span>
            ) : (
              <span className="rounded-full bg-text-faint/10 px-2 py-0.5 text-xs font-medium uppercase text-text-muted ring-1 ring-text-faint/30">
                not set
              </span>
            )}
          </span>
        </div>

        <form action={saveGroqKeyAction} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
              {hasGroqKey ? "Replace Groq API key" : "Paste your Groq API key"}
            </span>
            <input
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder="gsk_..."
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <span className="mt-1 block text-xs text-text-muted">
              Get one at{" "}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                console.groq.com/keys
              </a>
              . Free tier, no credit card.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
            >
              Save + validate
            </button>
          </div>
        </form>

        {hasGroqKey ? (
          <form action={clearGroqKeyAction} className="mt-3 border-t border-border pt-3">
            <button type="submit" className="text-xs text-danger hover:underline">
              Remove the stored Groq key
            </button>
          </form>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Anthropic API key
        </h2>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="font-mono text-xs">
            Status:{" "}
            {hasKey ? (
              <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium uppercase text-success ring-1 ring-success/30">
                configured
              </span>
            ) : (
              <span className="rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium uppercase text-danger ring-1 ring-danger/30">
                not set
              </span>
            )}
          </span>
          {hasKey && settings?.updatedAt ? (
            <span className="text-xs text-text-muted">
              · saved {formatRelative(settings.updatedAt)}{updatedByEmail ? ` by ${updatedByEmail}` : ""}
            </span>
          ) : null}
        </div>

        <form action={saveAnthropicKeyAction} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
              {hasKey ? "Replace API key" : "Paste your Anthropic API key"}
            </span>
            <input
              name="apiKey"
              type="password"
              required
              autoComplete="off"
              placeholder="sk-ant-api03-..."
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <span className="mt-1 block text-xs text-text-muted">
              Get one at{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                console.anthropic.com/settings/keys
              </a>
              . You pay Anthropic directly — the platform never bills you for usage.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
            >
              Save + validate
            </button>
          </div>
        </form>

        {hasKey ? (
          <form action={clearAnthropicKeyAction} className="mt-3 border-t border-border pt-3">
            <button
              type="submit"
              className="text-xs text-danger hover:underline"
            >
              Remove the stored key
            </button>
          </form>
        ) : null}
      </section>

      {/* ── PageSpeed Insights — fixes Tech Watchdog 429s ───────────── */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            PageSpeed Insights API key
          </h2>
          {hasPagespeedKey ? (
            <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium uppercase text-success ring-1 ring-success/30">
              configured
            </span>
          ) : (
            <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium uppercase text-warning ring-1 ring-warning/30">
              not set · rate limited
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Without a key, Tech Watchdog and the Core Web Vitals lab-data fallback share Google&apos;s
          unauthenticated tier (~25 requests/100s network-wide) — this is what causes the 429 errors.
          A free key raises that ceiling substantially.
        </p>
        <details className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-xs text-text-muted">
          <summary className="cursor-pointer font-medium text-text">Google Cloud Console setup</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Open <a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">console.cloud.google.com → PageSpeed Insights API</a> and click <strong>Enable</strong> (create a project first if you don&apos;t have one).</li>
            <li>Go to <strong>APIs &amp; Services → Credentials → Create credentials → API key</strong>.</li>
            <li>(Recommended) Restrict the key to the PageSpeed Insights API only, under &quot;API restrictions&quot;.</li>
            <li>Copy the key and paste it below.</li>
          </ol>
        </details>
        <form action={savePagespeedKeyAction} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
              {hasPagespeedKey ? "Replace PageSpeed key" : "Paste your PageSpeed API key"}
            </span>
            <input
              name="apiKey"
              type="password"
              required
              autoComplete="off"
              placeholder="AIzaSy..."
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover">
            Save + validate
          </button>
        </form>
        {hasPagespeedKey ? (
          <form action={clearPagespeedKeyAction} className="mt-3 border-t border-border pt-3">
            <button type="submit" className="text-xs text-danger hover:underline">Remove the stored key</button>
          </form>
        ) : null}
      </section>

      {/* ── Chrome UX Report — powers real-user CWV field data ──────── */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Chrome UX Report (CrUX) API key
          </h2>
          {hasCruxKey ? (
            <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium uppercase text-success ring-1 ring-success/30">
              configured
            </span>
          ) : (
            <span className="rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium uppercase text-danger ring-1 ring-danger/30">
              not set
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Powers the Core Web Vitals dashboard&apos;s real-user field data (p75 LCP/CLS/INP from actual
          visitors). Without this key the daily CWV sync fails closed and the dashboard can only show
          PSI lab data, which is synthetic and a weaker signal.
        </p>
        <details className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-xs text-text-muted">
          <summary className="cursor-pointer font-medium text-text">Google Cloud Console setup</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Open <a href="https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">console.cloud.google.com → Chrome UX Report API</a> and click <strong>Enable</strong>.</li>
            <li>Go to <strong>APIs &amp; Services → Credentials → Create credentials → API key</strong> (can reuse the same project as PageSpeed).</li>
            <li>(Recommended) Restrict the key to the Chrome UX Report API only.</li>
            <li>Copy the key and paste it below. Note: CrUX only has data for sites with enough real-world Chrome traffic — low-traffic sites will still show &quot;no data&quot; and fall back to PSI lab metrics.</li>
          </ol>
        </details>
        <form action={saveCruxKeyAction} className="mt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
              {hasCruxKey ? "Replace CrUX key" : "Paste your CrUX API key"}
            </span>
            <input
              name="apiKey"
              type="password"
              required
              autoComplete="off"
              placeholder="AIzaSy..."
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover">
            Save + validate
          </button>
        </form>
        {hasCruxKey ? (
          <form action={clearCruxKeyAction} className="mt-3 border-t border-border pt-3">
            <button type="submit" className="text-xs text-danger hover:underline">Remove the stored key</button>
          </form>
        ) : null}
      </section>

      {/* ── IndexNow daily quota ─────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          IndexNow daily submission cap
        </h2>
        <p className="mt-2 text-xs text-text-muted">
          Network-wide soft limit on IndexNow submissions/day, shown as the usage card on Index
          Tracker and Indexing. Submissions are blocked once the cap is reached for the day (UTC).
        </p>
        <form action={saveIndexnowQuotaAction} className="mt-3 flex items-center gap-3">
          <input
            name="quota"
            type="number"
            min={1}
            max={10000}
            defaultValue={settings?.indexnowDailyQuota ?? 200}
            className="w-28 rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover">
            Save cap
          </button>
        </form>
      </section>
      </div>
      )}

      {section === "general" && (
      <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Provider preference
        </h2>
        <p className="mt-2 text-xs text-text-muted">
          Which LLM to try <strong>first</strong> for routine tasks (form parse, quote intent,
          chat). Falls back to the next configured provider automatically if the first is rate-
          limited or unavailable. Heavy tasks (audit, deep research) always use Anthropic if
          configured.
        </p>
        <form action={updateLlmProviderPreferenceAction} className="mt-3 flex items-center gap-3">
          <select
            name="provider"
            defaultValue={providerPref}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value="gemini">Gemini first → Groq → Anthropic → regex</option>
            <option value="groq">Groq first → Gemini → Anthropic → regex</option>
            <option value="anthropic">Anthropic first → Gemini → Groq → regex</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
          >
            Save preference
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Model + features
        </h2>
        <form action={updateLlmSettingsAction} className="mt-3 space-y-4">
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-text-muted">
              Model
            </span>
            <select
              name="model"
              defaultValue={settings?.llmModel ?? "claude-opus-4-7"}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="auditEnabled"
              defaultChecked={settings?.auditEnabled ?? true}
              className="accent-accent"
            />
            Audit agent <span className="text-text-muted text-xs">— flags tasks not done within their window</span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="digestEnabled"
              defaultChecked={settings?.digestEnabled ?? true}
              className="accent-accent"
            />
            Daily digest <span className="text-text-muted text-xs">— who&apos;s absent, what&apos;s delayed, who&apos;s responsible</span>
          </label>

          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
          >
            Save
          </button>
        </form>
      </section>

      {/*
        Network-wide AI knowledge — applies to EVERY site. The chat widget
        and smart-quote parser both read this before per-site KB at
        /admin/sites/<slug>. Use this for facts that hold across the whole
        operation: service area (e.g. "Dubai + all UAE emirates"), shared
        policies, working hours, currency + VAT rules. Per-site KB layers
        local detail on top.
      */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Network-wide AI knowledge
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Applied to every site's chat widget and voice booking assistant. Edit per-site overrides at{" "}
              <code>/admin/sites/&lt;slug&gt;</code>. The AI treats this as ground truth across the network — paste
              the facts that hold for the whole operation (service area, shared policies, airports served).
            </p>
          </div>
          <span className="text-xs text-text-faint">
            {(settings?.networkKnowledgeBase ?? "").length} / 16 384 chars
          </span>
        </div>
        <form action={saveNetworkKnowledgeAction} className="mt-4 space-y-3">
          <textarea
            name="network_knowledge_base"
            rows={16}
            maxLength={16384}
            defaultValue={settings?.networkKnowledgeBase ?? ""}
            placeholder={DEFAULT_NETWORK_KB}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-faint">
              Leave blank to use the built-in default (Dubai + UAE cleaning-services coverage plus the standard policies, hours, and AED pricing rules).
              The default is what the placeholder shows — copy it into the box to start customizing.
            </p>
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
            >
              Save network knowledge
            </button>
          </div>
        </form>
      </section>
      </div>
      )}

      {section === "integrations" && (
      <div className="mt-6 space-y-2">
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Integration credentials
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Toggle each integration on to configure credentials. Secrets are encrypted on save.
          Per-site OAuth connections happen on each site&apos;s detail page.
        </p>

        <IntegrationToggle title="Google (GSC + GA4)" enabled={!!settings?.googleOauthClientId}>
          <ProviderForm
            title="Google (GSC + GA4)"
            provider="google"
            hasCreds={!!settings?.googleOauthClientId}
            fields={[
              { name: "google_client_id", label: "OAuth client ID (.apps.googleusercontent.com)", type: "text", currentValue: settings?.googleOauthClientId },
              { name: "google_secret", label: "OAuth client secret", type: "password", secretSet: !!settings?.googleOauthSecretCiphertext },
            ]}
            hint={
              <div className="space-y-3">
                <p>
                  Without these credentials, per-site &ldquo;Connect Google&rdquo; buttons fail with{" "}
                  <code className="font-mono text-xs">google-not-configured</code>. Set them once
                  here — the same OAuth app powers GSC + GA4 for every site.
                </p>
                <div className="rounded-md border border-border bg-surface-2 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                    Authorized redirect URI (paste this into Google Cloud)
                  </p>
                  <code className="mt-1 block break-all font-mono text-xs text-text">
                    {googleRedirectUri}
                  </code>
                </div>
                <details className="rounded-md border border-border bg-surface-2 p-3">
                  <summary className="cursor-pointer text-[12px] font-medium text-text">
                    Google Cloud Console setup (5 steps)
                  </summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs">
                    <li>
                      Open{" "}
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        console.cloud.google.com → APIs &amp; Services → Credentials
                      </a>{" "}
                      (create a project first if needed).
                    </li>
                    <li>
                      Enable{" "}
                      <a
                        href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        Search Console API
                      </a>{" "}
                      and{" "}
                      <a
                        href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        Google Analytics Data API
                      </a>
                      .
                    </li>
                    <li>
                      Configure the <strong>OAuth consent screen</strong> (External / Testing is
                      fine for a private tool) and add your Google account under{" "}
                      <em>Test users</em>.
                    </li>
                    <li>
                      Create credentials → <strong>OAuth client ID</strong> → application type{" "}
                      <strong>Web application</strong>. Under{" "}
                      <em>Authorized redirect URIs</em>, paste the URI shown above.
                    </li>
                    <li>
                      Copy the client ID + client secret into the fields below and hit{" "}
                      <strong>Save</strong>.
                    </li>
                  </ol>
                  <p className="mt-2 text-[11px] text-text-muted">
                    Scopes requested at connect time:{" "}
                    <code className="font-mono">webmasters.readonly</code> +{" "}
                    <code className="font-mono">analytics.readonly</code>.
                  </p>
                </details>
              </div>
            }
          />
        </IntegrationToggle>

        <IntegrationToggle title="Outbound email (SMTP)" enabled={!!settings?.smtpEnabled}>
          <div className="mt-4 rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Outbound email (SMTP)</div>
              {settings?.smtpEnabled ? (
                <span className="rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium uppercase text-success ring-1 ring-success/30">
                  configured
                </span>
              ) : (
                <span className="rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium uppercase text-danger ring-1 ring-danger/30">
                  not set
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted">
              Used for task/lead notifications, the daily digest, and AI flag alerts. Any SMTP server
              works (SES, Sendgrid SMTP, Postfix on the VPS, etc.). The password is encrypted on save
              and never displayed.
            </p>
            <form action={saveSmtpSettingsAction} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-text-muted">Email service</span>
                <input
                  name="smtp_provider_name"
                  type="text"
                  autoComplete="off"
                  defaultValue={settings?.smtpProviderName ?? ""}
                  placeholder="Sender"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-text-muted">SMTP host</span>
                <input
                  name="smtp_host"
                  type="text"
                  autoComplete="off"
                  defaultValue={settings?.smtpHost ?? ""}
                  placeholder="smtp.sender.net"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted">Port</span>
                <input
                  name="smtp_port"
                  type="number"
                  min={1}
                  max={65535}
                  autoComplete="off"
                  defaultValue={settings?.smtpPort ?? 587}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted">From address</span>
                <input
                  name="smtp_from"
                  type="text"
                  autoComplete="off"
                  defaultValue={settings?.smtpFrom ?? ""}
                  placeholder="GYL Platform &lt;notify@example.com&gt;"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted">SMTP username</span>
                <input
                  name="smtp_user"
                  type="text"
                  autoComplete="off"
                  defaultValue={settings?.smtpUser ?? ""}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted">
                  SMTP password {settings?.smtpPasswordCiphertext ? "(leave blank to keep current)" : ""}
                </span>
                <input
                  name="smtp_password"
                  type="password"
                  autoComplete="off"
                  placeholder={settings?.smtpPasswordCiphertext ? "•••••••• (already set)" : ""}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-text-muted">
                  Public base URL (used for links in emails)
                </span>
                <input
                  name="public_base_url"
                  type="url"
                  autoComplete="off"
                  defaultValue={settings?.publicBaseUrl ?? ""}
                  placeholder="http://localhost:3001"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  name="smtp_enabled"
                  defaultChecked={settings?.smtpEnabled ?? false}
                  className="accent-accent"
                />
                Enable outbound email <span className="text-text-muted text-xs">— turn off to silently swallow all sends</span>
              </label>
              <div className="flex items-center justify-end gap-2 sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
                >
                  Save
                </button>
              </div>
            </form>
            <form action={sendTestEmailAction} className="mt-3 border-t border-border pt-3">
              <button
                type="submit"
                className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                disabled={!settings?.smtpEnabled}
                title={settings?.smtpEnabled ? "" : "Enable SMTP first"}
              >
                Send test email to me
              </button>
              <span className="ml-2 text-xs text-text-muted">
                Sends to your account&apos;s email address.
              </span>
            </form>
          </div>
        </IntegrationToggle>

        <IntegrationToggle title="Telegram bot" enabled={!!settings?.telegramBotTokenCiphertext}>
          <div className="mt-4 rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 text-sm font-medium">Telegram bot</div>
            <p className="text-xs text-text-muted">
              Get SEO autopilot updates pushed to Telegram. Create a bot via{" "}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-accent underline">@BotFather</a>{" "}
              (one-time, free), paste the token below, then message{" "}
              <code className="font-mono">/start</code> to your bot to link your admin account.
            </p>
            {settings?.telegramBotTokenCiphertext ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-md border border-success-tint bg-success-tint/40 px-3 py-2 text-xs">
                  <div className="font-medium text-text">Connected{settings.telegramBotUsername ? ` · @${settings.telegramBotUsername}` : ""}</div>
                  <div className="mt-0.5 text-text-muted">
                    Webhook registered at <code className="font-mono">/api/integrations/telegram/webhook</code>.
                    Send <code className="font-mono">/start</code> to {settings.telegramBotUsername ? `@${settings.telegramBotUsername}` : "your bot"} to link your account.
                  </div>
                </div>
                <SendTestPushButton />
                <form action={clearTelegramBotAction}>
                  <button
                    type="submit"
                    className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                  >
                    Disconnect bot
                  </button>
                </form>
              </div>
            ) : (
              <form action={saveTelegramBotAction} className="mt-3 space-y-3">
                <label className="block text-xs font-medium text-text-muted" htmlFor="telegramBotToken">
                  Bot token from @BotFather
                </label>
                <input
                  id="telegramBotToken"
                  name="telegramBotToken"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="1234567890:ABCDEFghijklmnopqrstuvwxyz0123456789"
                  className="block w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs tracking-tight text-text"
                />
                <p className="text-xs text-text-muted">
                  Format: <code className="font-mono">&lt;bot-id&gt;:&lt;random&gt;</code>. The token is encrypted with the same key
                  that protects the Anthropic API key.
                </p>
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
                >
                  Connect bot
                </button>
              </form>
            )}
          </div>
        </IntegrationToggle>

        <IntegrationToggle title="REST API" enabled={true}>
          <div className="mt-4 rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 text-sm font-medium">REST API</div>
            <p className="text-xs text-text-muted">
              Each site&apos;s GYL Suite plugin exposes HMAC-signed REST endpoints
              (heartbeat, event ingest, SEO inventory, SEO apply fixes) — this platform talks to
              WordPress exclusively through them. There is nothing to configure here at the org
              level; per-site setup and the full endpoint reference live on the connect page.
            </p>
            <Link
              href="/admin/sites/connect?method=rest-api"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              View REST API reference →
            </Link>
          </div>
        </IntegrationToggle>

        <IntegrationToggle title="WordPress" enabled={true}>
          <div className="mt-4 rounded-lg border border-border bg-surface p-3">
            <div className="mb-2 text-sm font-medium">WordPress</div>
            <p className="text-xs text-text-muted">
              The GYL Suite plugin (booking forms, lead capture, heartbeat, AI chat, smart-quote
              voice widget) is the only integration touchpoint on each WordPress site — installed
              once per site from the connect wizard. There&apos;s no separate org-wide credential:
              each site gets its own plugin install and HMAC secret.
            </p>
            <Link
              href="/admin/sites/connect"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              Install on a site →
            </Link>
          </div>
        </IntegrationToggle>
      </section>
      </div>
      )}

      {section === "general" && (
      <section className="mt-6 rounded-lg border border-accent/20 bg-accent/[0.04] p-4 text-xs text-text-muted">
        <p className="font-semibold text-text">How it&apos;s wired</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Chat assistant</strong> at{" "}
            <Link href="/admin/chat" className="text-accent underline">
              /admin/chat
            </Link>{" "}
            — read-only, role-aware. Calls Anthropic with caching for the system + tools prefix.
          </li>
          <li>
            <strong>Audit agent</strong> — run <code className="font-mono">npm run ai:audit</code>{" "}
            (stop the dev server first; PGlite is single-process). Writes a verdict comment on each
            checked task.
          </li>
          <li>
            <strong>Daily digest</strong> — run <code className="font-mono">npm run ai:digest</code>.
            Drops notifications for admin + every team manager. See cron line in{" "}
            <Link href="/admin" className="text-accent underline">
              the docs
            </Link>
            .
          </li>
        </ul>
      </section>
      )}
    </div>
  );
}
