import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
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
} from "lucide-react";

const settingsTabIds = [
  "general",
  "apis",
  "integrations",
  "roles",
  "automation",
  "webhooks",
  "audit",
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

const tabs = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "apis", label: "APIs", icon: KeyRound },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "roles", label: "Team & Roles", icon: Users },
  { id: "automation", label: "Automation", icon: Workflow },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "audit", label: "Audit Log", icon: ScrollText },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

type TabId = (typeof tabs)[number]["id"];

function SettingsPage() {
  const [tab, setTab] = useState<TabId>("general");

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40">
            <SlidersHorizontal className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Settings</h1>
            <p className="text-sm text-slate-400">Programmer + agency-owner controls · encrypted at rest (AES-256-GCM).</p>
          </div>
        </header>

        <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/40 p-1">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-900 hover:text-white"
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
        {tab === "audit" && <AuditPanel />}
        {tab === "logs" && <LogsPanel />}
        {tab === "notifications" && <NotificationsPanel />}
      </div>
    </div>
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-800 py-3 first:border-t-0 first:pt-0">
      <div className="text-sm text-slate-300">{label}</div>
      <div className="text-sm text-white">{value}</div>
    </div>
  );
}

function GeneralPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Workspace" desc="Identity used across dashboards & exports.">
        <Row label="Workspace name" value="AKS SEO" />
        <Row label="Timezone" value="Asia/Dubai (GST)" />
        <Row label="Default LLM" value="gpt-4o" />
        <Row label="Currency" value="AED" />
      </Card>
      <Card title="Provider preference" desc="Which model to try first for routine tasks.">
        <select className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white">
          <option>Gemini → Groq → Anthropic</option>
          <option>Anthropic → OpenAI → Gemini</option>
          <option>OpenAI only</option>
        </select>
        <div className="mt-4 space-y-2">
          {["Audit agent — flags tasks not done within window", "Daily digest — who's absent, what's delayed"].map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-400" />
              {l}
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ApiPanel() {
  const keys = [
    { name: "GOOGLE GEMINI", desc: "Free tier · 1,500 req/day", badge: "RECOMMENDED", set: true },
    { name: "GROQ", desc: "Free tier · 14,400 req/day", badge: "BACKUP", set: false },
    { name: "ANTHROPIC", desc: "Pay-as-you-go", badge: null, set: true },
    { name: "PAGESPEED", desc: "CWV field data", badge: null, set: false },
    { name: "OPENAI", desc: "GPT-4o & o4 models", badge: null, set: true },
    { name: "SEMRUSH", desc: "Keyword + backlink data", badge: "PRO", set: true },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {keys.map((k) => (
        <div key={k.name} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-cyan-300" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">{k.name} API KEY</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{k.desc}</p>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${k.set ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300"}`}>
              {k.set ? "Set" : "Not set"}
            </span>
          </div>
          <input
            type="password"
            placeholder="sk-•••"
            className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-400/40"
          />
          <button className="mt-2 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">Save + validate</button>
        </div>
      ))}
    </div>
  );
}

function IntegrationsPanel() {
  const items = [
    { name: "Google (GSC + GA4)", desc: "OAuth for per-site rank + traffic sync", on: true },
    { name: "Outbound email (SMTP)", desc: "Postmark / SendGrid / Amazon SES", on: false },
    { name: "Slack", desc: "Real-time alerts to any channel", on: true },
    { name: "Telegram bot", desc: "Direct DMs for owners", on: false },
    { name: "REST API", desc: "HMAC-signed endpoints for GYL plugin", on: true },
    { name: "WordPress plugin", desc: "Direct install to each connected site", on: true },
    { name: "Stripe", desc: "Client invoicing & subscriptions", on: false },
    { name: "Zapier", desc: "20K+ downstream automations", on: false },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((i) => (
        <div key={i.name} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 ring-1 ring-cyan-400/20">
              <Plug className="h-4 w-4 text-cyan-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{i.name}</div>
              <div className="text-[11px] text-slate-400">{i.desc}</div>
            </div>
          </div>
          <div className={`h-5 w-9 rounded-full transition ${i.on ? "bg-cyan-400" : "bg-slate-700"} relative`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${i.on ? "left-4" : "left-0.5"}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RolesPanel() {
  const members = [
    { name: "Ahmed K.", email: "ahmed@aks.co", role: "Owner", tone: "text-cyan-200 border-cyan-400/30 bg-cyan-400/10" },
    { name: "Sara M.", email: "sara@aks.co", role: "Admin", tone: "text-violet-200 border-violet-400/30 bg-violet-400/10" },
    { name: "Yusuf T.", email: "yusuf@aks.co", role: "Editor", tone: "text-emerald-200 border-emerald-400/30 bg-emerald-400/10" },
    { name: "Client · Bright Smile", email: "client@brightsmile.ae", role: "Viewer", tone: "text-slate-300 border-slate-700 bg-slate-900" },
  ];
  return (
    <Card title="Team & role-based access" desc="Roles map to server-side policies (never trusted from the client).">
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-12 gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500">
          <div className="col-span-4">Member</div>
          <div className="col-span-4">Email</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {members.map((m) => (
          <div key={m.email} className="grid grid-cols-12 items-center gap-3 border-b border-slate-900 px-4 py-3 last:border-b-0">
            <div className="col-span-4 flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[10px] font-bold text-slate-950">
                {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <span className="text-sm text-white">{m.name}</span>
            </div>
            <div className="col-span-4 text-xs text-slate-400">{m.email}</div>
            <div className="col-span-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${m.tone}`}>{m.role}</span>
            </div>
            <div className="col-span-2 text-right">
              <button className="text-[11px] text-cyan-300 hover:text-cyan-200">Edit</button>
            </div>
          </div>
        ))}
      </div>
      <button className="mt-4 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">+ Invite member</button>
    </Card>
  );
}

function AutomationPanel() {
  const rules = [
    { name: "Rank drop > 5 positions", action: "Notify #seo-alerts + assign to Auditor", on: true },
    { name: "Backlink lost from DR60+", action: "Create outreach task in Off-Page Expert", on: true },
    { name: "New keyword opportunity", action: "Draft brief in Content Scout", on: false },
    { name: "CWV LCP > 2.5s", action: "Assign to Technical Expert", on: true },
    { name: "Weekly digest", action: "Email owners every Monday 09:00 GST", on: true },
  ];
  return (
    <Card title="Automation rules" desc="Trigger → action pipelines evaluated every 60s by the daemon.">
      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.name} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-400/20">
                <Workflow className="h-4 w-4 text-cyan-300" />
              </div>
              <div>
                <div className="text-sm font-medium text-white">{r.name}</div>
                <div className="text-[11px] text-slate-400">→ {r.action}</div>
              </div>
            </div>
            <div className={`h-5 w-9 rounded-full transition ${r.on ? "bg-cyan-400" : "bg-slate-700"} relative`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${r.on ? "left-4" : "left-0.5"}`} />
            </div>
          </div>
        ))}
      </div>
      <button className="mt-4 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">+ New rule</button>
    </Card>
  );
}

function WebhooksPanel() {
  const [copied, setCopied] = useState(false);
  const url = "https://api.aks-seo.com/webhooks/inbound/8f92a1";
  return (
    <Card title="Outbound webhooks" desc="Push events to Slack, Zapier, n8n, or any HTTPS endpoint (HMAC-signed).">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Inbound endpoint (for the WP plugin)</div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-slate-900 px-2 py-1.5 font-mono text-xs text-cyan-200">{url}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-400/40"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input placeholder="Label · e.g. Slack #ops" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
        <input placeholder="https://hooks.slack.com/…" className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
      </div>
      <button className="mt-3 rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">+ Add subscriber</button>
    </Card>
  );
}

function AuditPanel() {
  const entries = [
    { ts: "07:12", who: "Ahmed K.", what: "Updated Anthropic API key" },
    { ts: "06:58", who: "Sara M.", what: "Invited yusuf@aks.co as Editor" },
    { ts: "06:44", who: "system", what: "Rotated LOVABLE_API_KEY" },
    { ts: "yesterday", who: "Ahmed K.", what: "Enabled automation rule 'Rank drop > 5'" },
  ];
  return (
    <Card title="Audit log" desc="Every privileged action, immutable · 90-day retention.">
      <div className="divide-y divide-slate-800">
        {entries.map((e, i) => (
          <div key={i} className="flex items-center justify-between py-3 text-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-cyan-300" />
              <span className="text-white">{e.what}</span>
            </div>
            <div className="text-xs text-slate-400">{e.who} · {e.ts}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NotificationsPanel() {
  const rows = [
    "Site health drops below 80",
    "New backlink from DR60+ referrer",
    "Weekly rank report",
    "Failed cron / job runner error",
    "Client invoice paid",
  ];
  return (
    <Card title="Notifications" desc="Per-channel routing for each event class.">
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-12 gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500">
          <div className="col-span-6">Event</div>
          <div className="col-span-2 text-center">Email</div>
          <div className="col-span-2 text-center">Slack</div>
          <div className="col-span-2 text-center">Push</div>
        </div>
        {rows.map((r, i) => (
          <div key={r} className="grid grid-cols-12 items-center gap-3 border-b border-slate-900 px-4 py-3 last:border-b-0 text-sm text-slate-200">
            <div className="col-span-6 flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-300" /> {r}</div>
            {[0, 1, 2].map((c) => (
              <div key={c} className="col-span-2 text-center">
                <input type="checkbox" defaultChecked={i % (c + 2) === 0} className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-400" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

type LogLevel = "info" | "warn" | "error" | "debug";
type LogRow = { ts: string; level: LogLevel; source: string; msg: string };

const logSeed: LogRow[] = [
  { ts: "07:12:44", level: "info", source: "build-agent", msg: "Job spotlesscleaningservices → phase=global_research queued" },
  { ts: "07:12:38", level: "info", source: "keyword-scout", msg: "Fetched 214 keywords from Semrush (dubai-cleaning)" },
  { ts: "07:11:20", level: "warn", source: "cwv", msg: "LCP 2.8s > 2.0s budget on /services/deep-clean" },
  { ts: "07:10:02", level: "error", source: "outreach", msg: "SMTP 550: recipient rejected (batch #42)" },
  { ts: "07:08:55", level: "info", source: "auditor", msg: "Rubric audit passed for 4 pages" },
  { ts: "07:07:12", level: "debug", source: "router", msg: "Prefetch /agents/onpage" },
  { ts: "07:06:44", level: "info", source: "gateway", msg: "Anthropic call · 1.2s · $0.014" },
];

const logTone: Record<LogLevel, string> = {
  info: "text-cyan-300 bg-cyan-400/10 border-cyan-400/20",
  warn: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  error: "text-rose-300 bg-rose-400/10 border-rose-400/20",
  debug: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

function LogsPanel() {
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const rows = logSeed.filter((r) => level === "all" || r.level === level);

  return (
    <Card title="System Logs" desc="Live tail across every agent, gateway, and job runner.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs">
          <span className="pr-1 text-[10px] uppercase tracking-wider text-slate-500">Level</span>
          {(["all", "info", "warn", "error", "debug"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wider ${level === l ? "bg-cyan-400 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <button className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400/40">
          Export
        </button>
      </div>
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="grid grid-cols-12 gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500">
          <div className="col-span-2">Timestamp</div>
          <div className="col-span-1">Level</div>
          <div className="col-span-2">Source</div>
          <div className="col-span-7">Message</div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto font-mono text-[12px]">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-3 border-b border-slate-900 px-4 py-2 hover:bg-slate-900/40">
              <div className="col-span-2 text-slate-500">{r.ts}</div>
              <div className="col-span-1">
                <span className={`inline-flex rounded border px-1.5 py-px text-[9px] uppercase tracking-wider ${logTone[r.level]}`}>{r.level}</span>
              </div>
              <div className="col-span-2 text-cyan-300">{r.source}</div>
              <div className="col-span-7 text-slate-200">{r.msg}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
