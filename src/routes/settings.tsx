import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useSite } from "@/lib/site-context";
import {
  SlidersHorizontal,
  KeyRound,
  Plug,
  Users,
  Webhook,
  ScrollText,
  Bell,
  Bot,
  Workflow,
  ShieldCheck,
  Check,
  Copy,
  Lock,
} from "lucide-react";

const settingsTabIds = [
  "general",
  "apis",
  "integrations",
  "roles",
  "automation",
  "webhooks",
  "logs",
  "notifications",
] as const;

export const Route = createFileRoute("/settings")({
  validateSearch: z.object({
    tab: z.enum(settingsTabIds).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Settings — AKS SEO Console" },
      { name: "description", content: "Workspace, API, integrations, roles, and automation config." },
    ],
  }),
  component: SettingsPage,
});

type WorkspaceRole = "Owner" | "Admin" | "Editor" | "Viewer";

// Prototype role source. In production this comes from the auth context /
// server session (see `tanstack-auth-guards`), never from client storage.
function useCurrentRole(): WorkspaceRole {
  const [role, setRole] = useState<WorkspaceRole>("Owner");
  // read once on mount to keep SSR happy
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("aks:role") as WorkspaceRole | null;
    if (stored && stored !== role) setRole(stored);
  }
  return role;
}

// Same allowlist the old /logs Intelligence entry used: system logs are
// programmer/owner surface only.
const LOGS_ALLOWED: ReadonlySet<WorkspaceRole> = new Set(["Owner", "Admin"]);
const canViewLogs = (role: WorkspaceRole) => LOGS_ALLOWED.has(role);

const tabs = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "apis", label: "APIs", icon: KeyRound },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "roles", label: "Team & Roles", icon: Users },
  { id: "automation", label: "Automation", icon: Workflow },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

type TabId = (typeof tabs)[number]["id"];

function SettingsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const role = useCurrentRole();
  const requested = (search.tab as TabId | undefined) ?? "general";

  const [activeTabState, setActiveTabState] = useState<TabId>(requested);

  // The Logs tab itself is open to every role now (it includes the
  // Audit Log feed everyone could already see); only the raw System Logs
  // widget inside it is gated to Owner/Admin, via LogsPanel's own prop.
  const tab: TabId = activeTabState ?? requested;

  const setTab = (id: TabId) => {
    setActiveTabState(id);
    navigate({ search: { tab: id === "general" ? undefined : id }, replace: true });
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40">
            <SlidersHorizontal className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Settings</h1>
            <p className="text-sm text-slate-400">Programmer + agency-owner controls · encrypted at rest (AES-256-GCM).</p>
          </div>
          <span className="ml-auto rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-400">
            Role · <span className="text-cyan-300">{role}</span>
          </span>
        </header>

        <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/40 p-1">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-cyan-400 text-slate-950"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "general" && <GeneralPanel />}
        {tab === "apis" && <ApiPanel />}
        {tab === "integrations" && <IntegrationsPanel />}
        {tab === "roles" && <RolesPanel />}
        {tab === "automation" && <AutomationPanel />}
        {tab === "webhooks" && <WebhooksPanel />}
        {tab === "logs" && <LogsPanel canViewSystemLogs={canViewLogs(role)} />}
        {tab === "notifications" && <NotificationsPanel />}
      </div>
    </div>
  );
}

function RestrictedPanel() {
  return (
    <Card title="System Logs" desc="Requires Owner or Admin role.">
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <Lock className="mt-0.5 h-4 w-4 text-amber-300" />
        <div className="text-xs text-slate-300">
          <p className="font-medium text-amber-200">Access denied</p>
          <p className="mt-1 text-slate-400">
            Your current role can&apos;t view the raw System Logs table below. Ask an Owner to grant the <span className="text-cyan-300">Admin</span> role — the
            <span className="text-cyan-300"> Audit Log</span> feed above already shows user-facing activity for every role.
          </p>
        </div>
      </div>
    </Card>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-slate-400">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

const PROVIDER_OPTIONS = [
  { value: "gemini", label: "Gemini → Groq → Anthropic" },
  { value: "anthropic", label: "Anthropic → OpenAI → Gemini" },
  { value: "openai", label: "OpenAI only" },
];

function GeneralPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [auditEnabled, setAuditEnabled] = useState(true);
  const [digestEnabled, setDigestEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/settings/general")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok && json.settings) {
          setProvider(json.settings.llmProviderPreference || "gemini");
          setAuditEnabled(!!json.settings.auditEnabled);
          setDigestEnabled(!!json.settings.digestEnabled);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async (patch: Record<string, any>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/general", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json?.ok) toast.error(json?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Provider preference" desc="Which model to try first for routine tasks. Saved to Postgres org_settings.">
        <select
          value={provider}
          disabled={loading}
          onChange={(e) => {
            setProvider(e.target.value);
            save({ llmProviderPreference: e.target.value });
          }}
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {PROVIDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={auditEnabled}
              disabled={loading}
              onChange={(e) => {
                setAuditEnabled(e.target.checked);
                save({ auditEnabled: e.target.checked });
              }}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-400"
            />
            Audit agent — flags tasks not done within window
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={digestEnabled}
              disabled={loading}
              onChange={(e) => {
                setDigestEnabled(e.target.checked);
                save({ digestEnabled: e.target.checked });
              }}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-400"
            />
            Daily digest — who's absent, what's delayed
          </label>
        </div>
        {saving && <p className="mt-2 text-[11px] text-cyan-300">Saving…</p>}
      </Card>
    </div>
  );
}

const API_PROVIDERS = [
  { key: "gemini", name: "GOOGLE GEMINI", desc: "Free tier · 1,500 req/day", badge: "RECOMMENDED" },
  { key: "groq", name: "GROQ", desc: "Free tier · 14,400 req/day", badge: "BACKUP" },
  { key: "anthropic", name: "ANTHROPIC", desc: "Pay-as-you-go", badge: null },
  { key: "pagespeed", name: "PAGESPEED", desc: "CWV field data", badge: null },
  { key: "openai", name: "OPENAI", desc: "GPT-4o & o4 models", badge: null },
  { key: "semrush", name: "SEMRUSH", desc: "Keyword + backlink data", badge: "PRO" },
] as const;

function ApiPanel() {
  const [loading, setLoading] = useState(true);
  const [set, setSet] = useState<Record<string, boolean>>({});
  const [masked, setMasked] = useState<Record<string, string | null>>({});
  const [encryptionConfigured, setEncryptionConfigured] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean | null; message: string } | null>(null);

  const load = () => {
    fetch("/api/settings/apikeys")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) {
          setSet(json.set || {});
          setMasked(json.masked || {});
          setEncryptionConfigured(json.encryptionConfigured !== false);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const verifyPageSpeed = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/settings/apikeys/verify-pagespeed", { method: "POST" });
      const json = await res.json();
      if (json?.ok) {
        setVerifyResult({ valid: json.valid, message: json.message });
        if (json.valid === false) toast.error("PageSpeed API key rejected by Google");
        else if (json.valid === true) toast.success("PageSpeed API key verified");
        else toast.warning("Could not verify right now");
      } else {
        setVerifyResult({ valid: null, message: json?.error || "Verification failed" });
        toast.error(json?.error || "Verification failed");
      }
    } catch (err: any) {
      setVerifyResult({ valid: null, message: err.message || "Verification failed" });
      toast.error("Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const saveKey = async (provider: string) => {
    const value = (inputs[provider] || "").trim();
    if (!value) return;
    setSavingKey(provider);
    try {
      const res = await fetch("/api/settings/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, value }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`${provider} key saved (encrypted)`);
        setSet((prev) => ({ ...prev, [provider]: true }));
        setInputs((prev) => ({ ...prev, [provider]: "" }));
      } else {
        toast.error(json?.error || "Failed to save key");
      }
    } finally {
      setSavingKey(null);
    }
  };

  const removeKey = async (provider: string) => {
    setSavingKey(provider);
    try {
      const res = await fetch("/api/settings/apikeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`${provider} key removed`);
        setSet((prev) => ({ ...prev, [provider]: false }));
      } else {
        toast.error(json?.error || "Failed to remove key");
      }
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-3">
      {!loading && !encryptionConfigured && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-[11px] text-rose-200">
          SETTINGS_ENCRYPTION_KEY is not configured on the server — keys cannot be saved until it's set.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
      {API_PROVIDERS.map((k) => (
        <div key={k.key} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-cyan-300" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">{k.name} API KEY</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{k.desc}</p>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${set[k.key] ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300"}`}>
              {loading ? "…" : set[k.key] ? "Set" : "Not set"}
            </span>
          </div>
          {set[k.key] && masked[k.key] && (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 font-mono text-xs text-slate-300">
              <Lock className="h-3 w-3 shrink-0 text-slate-500" /> {masked[k.key]}
            </div>
          )}
          <input
            type="password"
            placeholder={set[k.key] ? "•••••••• (set — enter a new value to replace)" : "sk-•••"}
            value={inputs[k.key] || ""}
            onChange={(e) => setInputs((prev) => ({ ...prev, [k.key]: e.target.value }))}
            disabled={!encryptionConfigured}
            className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400/40 disabled:opacity-50"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => saveKey(k.key)}
              disabled={!encryptionConfigured || savingKey === k.key || !(inputs[k.key] || "").trim()}
              className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
            >
              {savingKey === k.key ? "Saving…" : "Save"}
            </button>
            {set[k.key] && (
              <button
                onClick={() => removeKey(k.key)}
                disabled={savingKey === k.key}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-50"
              >
                Remove
              </button>
            )}
            {k.key === "pagespeed" && (
              <button
                onClick={verifyPageSpeed}
                disabled={verifying}
                className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-50"
              >
                {verifying ? "Verifying…" : "Verify connection"}
              </button>
            )}
          </div>
          {k.key === "pagespeed" && verifyResult && (
            <div
              className={`mt-2 rounded-lg border px-3 py-2 text-[11px] ${
                verifyResult.valid === true
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : verifyResult.valid === false
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-200"
              }`}
            >
              {verifyResult.message}
            </div>
          )}
          {k.key === "pagespeed" && (
            <p className="mt-2 text-[10px] text-slate-500">
              Without a key, PageSpeed calls still work but use Google's shared, low-quota keyless tier — set one here to raise the quota.
            </p>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}

const INTEGRATION_ITEMS = [
  { key: "smtp", name: "Outbound email (SMTP)", desc: "Postmark / SendGrid / Amazon SES" },
  { key: "slack", name: "Slack", desc: "Real-time alerts to any channel" },
  { key: "telegram", name: "Telegram bot", desc: "Direct DMs for owners" },
  { key: "restApi", name: "REST API", desc: "HMAC-signed endpoints for the WP plugin" },
  { key: "wordpress", name: "WordPress plugin", desc: "Direct install to each connected site" },
  { key: "stripe", name: "Stripe", desc: "Client invoicing & subscriptions" },
  { key: "zapier", name: "Zapier", desc: "20K+ downstream automations" },
] as const;

function IntegrationsPanel() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const { allSites, refreshSites } = useSite();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectingSiteId, setConnectingSiteId] = useState<string | null>(null);
  const [propertyInput, setPropertyInput] = useState("");
  const [savingConnect, setSavingConnect] = useState(false);

  useEffect(() => {
    fetch("/api/settings/integrations")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setEnabled(json.enabled || {});
      })
      .finally(() => setLoading(false));
  }, []);

  const disconnectGsc = async (siteId: string, label: string) => {
    if (!window.confirm(`Disconnect Search Console from ${label}? You'll need to re-enter its property URL to reconnect.`)) return;
    setDisconnecting(siteId);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gscConnected: false, gscPropertyUrl: null }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`Search Console disconnected from ${label}`);
        await refreshSites?.();
      } else {
        toast.error(json?.error || "Failed to disconnect");
      }
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(null);
    }
  };

  const connectGsc = async (siteId: string, label: string) => {
    const propertyUrl = propertyInput.trim();
    if (!propertyUrl) {
      toast.error("Enter a Search Console property URL (e.g. https://example.com/ or sc-domain:example.com)");
      return;
    }
    setSavingConnect(true);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gscConnected: true, gscPropertyUrl: propertyUrl }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`Search Console connected to ${label}`);
        setConnectingSiteId(null);
        setPropertyInput("");
        await refreshSites?.();
      } else {
        toast.error(json?.error || "Failed to connect");
      }
    } catch {
      toast.error("Failed to connect");
    } finally {
      setSavingConnect(false);
    }
  };

  const toggle = async (key: string) => {
    const next = !enabled[key];
    setEnabled((prev) => ({ ...prev, [key]: next }));
    const res = await fetch("/api/settings/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled: next }),
    });
    const json = await res.json();
    if (!json?.ok) {
      toast.error(json?.error || "Failed to save");
      setEnabled((prev) => ({ ...prev, [key]: !next }));
    }
  };

  return (
    <div className="space-y-3">
      {/* Real per-site Google Search Console connections -- GSC has no
          single "app-wide" connection to toggle since each site authorizes
          its own property; previously this was a single static card
          claiming "Live" with no way to see which property or disconnect
          one. */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-600/20 ring-1 ring-emerald-400/20">
            <Plug className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Google Search Console</div>
            <div className="text-[11px] text-slate-400">Connected per site — real property/account shown below, from the actual site record.</div>
          </div>
        </div>
        {allSites.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-4 text-center text-xs text-slate-500">
            No sites yet.
          </div>
        ) : (
          <div className="space-y-2">
            {allSites.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-white">{s.label}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                        s.gscConnected ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-slate-700 bg-slate-900/60 text-slate-500"
                      }`}>
                        {s.gscConnected ? "Connected" : "Not connected"}
                      </span>
                      <span className="truncate font-mono text-slate-400">{s.gscConnected ? s.gscDomain : "—"}</span>
                    </div>
                  </div>
                  {s.gscConnected ? (
                    <button
                      onClick={() => disconnectGsc(s.id, s.label)}
                      disabled={disconnecting === s.id}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-1.5 text-[11px] font-medium text-rose-300 hover:bg-rose-500/15 disabled:opacity-50"
                    >
                      {disconnecting === s.id ? "Disconnecting…" : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setConnectingSiteId(connectingSiteId === s.id ? null : s.id);
                        setPropertyInput("");
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-400/20"
                    >
                      Connect
                    </button>
                  )}
                </div>
                {connectingSiteId === s.id && (
                  <div className="mt-2.5 flex flex-col gap-2 border-t border-slate-800 pt-2.5 sm:flex-row">
                    <input
                      value={propertyInput}
                      onChange={(e) => setPropertyInput(e.target.value)}
                      placeholder="https://example.com/ or sc-domain:example.com"
                      className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-cyan-400/40"
                    />
                    <button
                      onClick={() => connectGsc(s.id, s.label)}
                      disabled={savingConnect || !propertyInput.trim()}
                      className="shrink-0 rounded-lg bg-cyan-400 px-3 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                    >
                      {savingConnect ? "Saving…" : "Save & connect"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[10px] text-slate-500">
          Requires the service account configured for this app to already have access to the property in Search Console.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
      {INTEGRATION_ITEMS.map((i) => (
        <div key={i.key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 ring-1 ring-cyan-400/20">
              <Plug className="h-4 w-4 text-cyan-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{i.name}</div>
              <div className="text-[11px] text-slate-400">{i.desc}</div>
            </div>
          </div>
          <button
            onClick={() => toggle(i.key)}
            disabled={loading}
            className={`h-5 w-9 rounded-full transition relative disabled:opacity-50 ${enabled[i.key] ? "bg-cyan-400" : "bg-slate-700"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${enabled[i.key] ? "left-4" : "left-0.5"}`} />
          </button>
        </div>
      ))}
      </div>
    </div>
  );
}

type MemberRow = { id: string; email: string; name: string | null; role: string; createdAt: string };

const ROLE_TONE: Record<string, string> = {
  owner: "text-cyan-200 border-cyan-400/30 bg-cyan-400/10",
  admin: "text-violet-200 border-violet-400/30 bg-violet-400/10",
  head_of_department: "text-amber-200 border-amber-400/30 bg-amber-400/10",
  editor: "text-emerald-200 border-emerald-400/30 bg-emerald-400/10",
  viewer: "text-slate-300 border-slate-700 bg-slate-900",
};

function RolesPanel() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/settings/roles")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setMembers(json.users || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/settings/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim() || undefined, role: inviteRole }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`Invited ${inviteEmail}`);
        setInviteEmail("");
        setInviteName("");
        setInviteOpen(false);
        load();
      } else {
        toast.error(json?.error || "Failed to invite member");
      }
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (id: string, role: string) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
    const res = await fetch(`/api/settings/roles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();
    if (!json?.ok) {
      toast.error(json?.error || "Failed to update role");
      load();
    }
  };

  const removeMember = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from the team?`)) return;
    setMembers((prev) => prev.filter((m) => m.id !== id));
    const res = await fetch(`/api/settings/roles/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json?.ok) {
      toast.success(`Removed ${email}`);
    } else {
      toast.error(json?.error || "Failed to remove member");
      load();
    }
  };

  return (
    <Card title="Team & role-based access" desc="Invites create a real account row — no email is sent yet (no SMTP wired), and there's no login flow to activate it. Roles are stored for real.">
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-12 gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500">
          <div className="col-span-4">Member</div>
          <div className="col-span-4">Email</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">Loading…</div>
        ) : members.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">No team members yet.</div>
        ) : (
          members.map((m) => {
            const displayName = m.name || m.email.split("@")[0];
            return (
              <div key={m.id} className="grid grid-cols-12 items-center gap-3 border-b border-slate-900 px-4 py-3 last:border-b-0">
                <div className="col-span-4 flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[10px] font-bold text-slate-950">
                    {displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm text-white">{displayName}</span>
                </div>
                <div className="col-span-4 text-xs text-slate-400">{m.email}</div>
                <div className="col-span-2">
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.id, e.target.value)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider bg-transparent ${ROLE_TONE[m.role] || ROLE_TONE.viewer}`}
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="head_of_department">Head of Department</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div className="col-span-2 text-right">
                  <button onClick={() => removeMember(m.id, m.email)} className="text-[11px] text-rose-300 hover:text-rose-200">Remove</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {inviteOpen ? (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input placeholder="email@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-400/50 focus:outline-none" />
            <input placeholder="Name (optional)" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-400/50 focus:outline-none" />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-400/50 focus:outline-none">
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="head_of_department">Head of Department</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={invite} disabled={inviting || !inviteEmail.trim()} className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
              {inviting ? "Inviting…" : "Send invite"}
            </button>
            <button onClick={() => setInviteOpen(false)} className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setInviteOpen(true)} className="mt-4 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">+ Invite member</button>
      )}
    </Card>
  );
}

type SettingsRule = { id: string; name: string; action: string; enabled: boolean };

function AutomationPanel() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<SettingsRule[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAction, setNewAction] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/settings/automation-rules")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setRules(json.rules || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    const next = !rule.enabled;
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: next } : r)));
    const res = await fetch(`/api/settings/automation-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    const json = await res.json();
    if (!json?.ok) {
      toast.error(json?.error || "Failed to save");
      load();
    }
  };

  const addRule = async () => {
    if (!newName.trim() || !newAction.trim()) return;
    const res = await fetch("/api/settings/automation-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), action: newAction.trim() }),
    });
    const json = await res.json();
    if (json?.ok) {
      toast.success("Rule added");
      setNewName("");
      setNewAction("");
      setAddOpen(false);
      load();
    } else {
      toast.error(json?.error || "Failed to add rule");
    }
  };

  const removeRule = async (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/settings/automation-rules/${id}`, { method: "DELETE" });
  };

  return (
    <Card title="Automation rules" desc="Rule toggles are saved for real. No daemon currently evaluates rank drops, backlinks, or CWV against live signals to fire these — persistence only, not live triggering yet. See the Automation screen for real, DB-backed flows.">
      <div className="space-y-2">
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-500">Loading…</div>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-400/20">
                  <Workflow className="h-4 w-4 text-cyan-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{r.name}</div>
                  <div className="text-[11px] text-slate-400">→ {r.action}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggle(r.id)} className={`h-5 w-9 rounded-full transition relative ${r.enabled ? "bg-cyan-400" : "bg-slate-700"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${r.enabled ? "left-4" : "left-0.5"}`} />
                </button>
                <button onClick={() => removeRule(r.id)} className="text-[11px] text-rose-300 hover:text-rose-200">Remove</button>
              </div>
            </div>
          ))
        )}
      </div>

      {addOpen ? (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <input placeholder="Rule name" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-400/50 focus:outline-none" />
          <input placeholder="Action (e.g. Notify #seo-alerts)" value={newAction} onChange={(e) => setNewAction(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-cyan-400/50 focus:outline-none" />
          <div className="flex gap-2">
            <button onClick={addRule} disabled={!newName.trim() || !newAction.trim()} className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">Add rule</button>
            <button onClick={() => setAddOpen(false)} className="rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddOpen(true)} className="mt-4 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">+ New rule</button>
      )}
    </Card>
  );
}

type WebhookRow = { id: string; label: string; url: string; active: boolean; createdAt: string; lastDeliveredAt: string | null; lastStatus: string | null };

function WebhooksPanel() {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const inboundUrl = typeof window !== "undefined" ? `${window.location.origin}/api/events/ingest` : "/api/events/ingest";

  const load = () => {
    setLoading(true);
    fetch("/api/settings/webhooks")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setWebhooks(json.webhooks || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const addSubscriber = async () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/settings/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), url: newUrl.trim() }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast.success("Subscriber added");
        setNewLabel("");
        setNewUrl("");
        load();
      } else {
        toast.error(json?.error || "Failed to add subscriber");
      }
    } finally {
      setAdding(false);
    }
  };

  const testWebhook = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/settings/webhooks/${id}/test`, { method: "POST" });
      const json = await res.json();
      if (json?.ok) {
        toast.success(`Delivery: ${json.status}`);
        load();
      } else {
        toast.error(json?.error || "Test failed");
      }
    } finally {
      setTestingId(null);
    }
  };

  const removeSubscriber = async (id: string) => {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    await fetch(`/api/settings/webhooks/${id}`, { method: "DELETE" });
  };

  return (
    <Card title="Outbound webhooks" desc="Subscribers are real. 'Test' fires a genuine HMAC-signed HTTP POST to the URL and records the real response.">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Inbound endpoint (HMAC-signed events, live)</div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-slate-900 px-2 py-1.5 font-mono text-xs text-cyan-200">{inboundUrl}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(inboundUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-400/40"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="py-4 text-center text-xs text-slate-500">Loading…</div>
        ) : webhooks.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">No outbound subscribers yet.</div>
        ) : (
          webhooks.map((w) => (
            <div key={w.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">{w.label}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{w.url}</div>
                  {w.lastStatus && (
                    <div className="mt-1 text-[10px] text-slate-500">Last delivery: {w.lastStatus}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => testWebhook(w.id)} disabled={testingId === w.id} className="rounded-md border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:border-cyan-400/40 disabled:opacity-50">
                    {testingId === w.id ? "Testing…" : "Test"}
                  </button>
                  <button onClick={() => removeSubscriber(w.id)} className="text-[11px] text-rose-300 hover:text-rose-200">Remove</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input placeholder="Label · e.g. Slack #ops" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
        <input placeholder="https://hooks.slack.com/…" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
      </div>
      <button onClick={addSubscriber} disabled={adding || !newLabel.trim() || !newUrl.trim()} className="mt-3 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
        {adding ? "Adding…" : "+ Add subscriber"}
      </button>
    </Card>
  );
}

type AuditEntry = { id: string; actorEmail: string; action: string; detail: Record<string, unknown>; createdAt: string };

function describeAuditAction(e: AuditEntry): string {
  const d = e.detail || {};
  switch (e.action) {
    case "api_key.updated": return `Updated ${d.provider} API key`;
    case "api_key.removed": return `Removed ${d.provider} API key`;
    case "role.invited": return `Invited ${d.email} as ${d.role}`;
    case "role.changed": return `Changed role for user ${d.userId} to ${d.role}`;
    case "role.removed": return `Removed team member ${d.userId}`;
    case "integration.toggled": return `${d.enabled ? "Enabled" : "Disabled"} ${d.key} integration`;
    case "webhook.added": return `Added webhook subscriber "${d.label}"`;
    case "webhook.updated": return `Updated webhook subscriber ${d.id}`;
    case "webhook.removed": return `Removed webhook subscriber ${d.id}`;
    case "webhook.tested": return `Tested webhook ${d.id} → ${d.status}`;
    case "automation_rule.created": return `Created automation rule "${d.name}"`;
    case "automation_rule.updated": return `Updated automation rule ${d.id}`;
    case "automation_rule.removed": return `Removed automation rule ${d.id}`;
    case "notification_pref.toggled": return `${d.enabled ? "Enabled" : "Disabled"} ${d.channel} for "${d.eventKey}"`;
    case "general_settings.updated": return "Updated general settings";
    case "site.updated": return `Updated site ${d.siteId} (${(d.fields as string[] | undefined)?.join(", ")})`;
    case "site.deleted": return `Deleted site ${d.siteId}`;
    default: return e.action;
  }
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type NotifPref = { id: string; eventKey: string; label: string; email: boolean; slack: boolean; push: boolean };

function NotificationsPanel() {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<NotifPref[]>([]);

  useEffect(() => {
    fetch("/api/settings/notifications")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setPrefs(json.prefs || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (eventKey: string, channel: "email" | "slack" | "push") => {
    const pref = prefs.find((p) => p.eventKey === eventKey);
    if (!pref) return;
    const next = !pref[channel];
    setPrefs((prev) => prev.map((p) => (p.eventKey === eventKey ? { ...p, [channel]: next } : p)));
    const res = await fetch("/api/settings/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventKey, channel, enabled: next }),
    });
    const json = await res.json();
    if (!json?.ok) {
      toast.error(json?.error || "Failed to save");
      setPrefs((prev) => prev.map((p) => (p.eventKey === eventKey ? { ...p, [channel]: !next } : p)));
    }
  };

  return (
    <Card title="Notifications" desc="Preferences are saved for real. No delivery channel (SMTP/Slack/Telegram) is wired to actually send yet — see the APIs and Integrations tabs.">
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-12 gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500">
          <div className="col-span-6">Event</div>
          <div className="col-span-2 text-center">Email</div>
          <div className="col-span-2 text-center">Slack</div>
          <div className="col-span-2 text-center">Push</div>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-slate-500">Loading…</div>
        ) : (
          prefs.map((p) => (
            <div key={p.eventKey} className="grid grid-cols-12 items-center gap-3 border-b border-slate-900 px-4 py-3 last:border-b-0 text-sm text-slate-200">
              <div className="col-span-6 flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-300" /> {p.label}</div>
              {(["email", "slack", "push"] as const).map((channel) => (
                <div key={channel} className="col-span-2 text-center">
                  <input
                    type="checkbox"
                    checked={p[channel]}
                    onChange={() => toggle(p.eventKey, channel)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-400"
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

// Logs reuses the real audit_log table (there is no separate application
// log store anywhere in this codebase — inventing a second fake data source
// would be worse than being explicit that this is the audit trail filtered
// by source). "Level" is inferred from the action name since audit_log has
// no severity column of its own.
function levelForAction(action: string): "info" | "warn" | "error" {
  if (/removed|deleted|failed/i.test(action)) return "warn";
  return "info";
}

const logTone: Record<string, string> = {
  info: "text-cyan-300 bg-cyan-400/10 border-cyan-400/20",
  warn: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  error: "text-rose-300 bg-rose-400/10 border-rose-400/20",
};

function LogsPanel({ canViewSystemLogs }: { canViewSystemLogs: boolean }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    fetch("/api/settings/audit?limit=200")
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setEntries(json.entries || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Both widgets below read the exact same `entries` (one fetch of the real
  // audit_log table) -- previously "Audit Log" was a separate top-level tab
  // making its own identical fetch to the same endpoint. There is no
  // separate application log store in this app; Audit Log and System Logs
  // were always the same real data shown two different ways (a friendly
  // feed vs. a raw table), so they're now one tab with two views instead of
  // two tabs a user had to realize were duplicates.
  const recentEntries = entries.slice(0, 20);

  return (
    <div className="space-y-4">
      <Card title="Audit Log" desc="Human-readable feed of privileged actions taken in Settings and per-site admin actions — real entries, written server-side as they happen.">
        {loading ? (
          <div className="py-6 text-center text-xs text-slate-500">Loading…</div>
        ) : recentEntries.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">No privileged actions recorded yet.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentEntries.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-3 text-sm">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-cyan-300" />
                  <span className="text-white">{describeAuditAction(e)}</span>
                </div>
                <div className="text-xs text-slate-400">{e.actorEmail} · {timeAgo(e.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {canViewSystemLogs ? (
        <Card title="System Logs" desc="Raw tail of the same real audit_log entries shown above — there is no separate application log store in this app yet.">
          <div className="mb-3 flex items-center justify-end">
            <button onClick={exportJson} disabled={entries.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400/40 disabled:opacity-50">
              Export
            </button>
          </div>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="grid grid-cols-12 gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500">
              <div className="col-span-2">Timestamp</div>
              <div className="col-span-1">Level</div>
              <div className="col-span-2">Actor</div>
              <div className="col-span-7">Message</div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto font-mono text-[12px]">
              {loading ? (
                <div className="px-4 py-6 text-center text-slate-500">Loading…</div>
              ) : entries.length === 0 ? (
                <div className="px-4 py-6 text-center text-slate-500">No entries recorded yet.</div>
              ) : (
                entries.map((e) => {
                  const lvl = levelForAction(e.action);
                  return (
                    <div key={e.id} className="grid grid-cols-12 gap-3 border-b border-slate-900 px-4 py-2 hover:bg-slate-900/40">
                      <div className="col-span-2 text-slate-500">{new Date(e.createdAt).toLocaleTimeString()}</div>
                      <div className="col-span-1">
                        <span className={`inline-flex rounded border px-1.5 py-px text-[9px] uppercase tracking-wider ${logTone[lvl]}`}>{lvl}</span>
                      </div>
                      <div className="col-span-2 text-cyan-300 truncate">{e.actorEmail}</div>
                      <div className="col-span-7 text-slate-200">{describeAuditAction(e)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Card>
      ) : (
        <RestrictedPanel />
      )}
    </div>
  );
}
