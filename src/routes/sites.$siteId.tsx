import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Bot,
  CheckCircle2,
  RefreshCw,
  Copy,
  ChevronDown,
  Trash2,
  Plus,
  type LucideIcon,
} from "lucide-react";

type SiteDetail = {
  id: string;
  domain: string;
  label: string;
  location: string;
  region: string;
  seoScore: number | null;
  pagesIndexed: number;
  newLeads: number;
  openFixes: number;
  aiKnowledge: string;
  apiKey: {
    keyId: string;
    status: "ACTIVE" | "REVOKED";
    lastUsed: string;
    created: string;
  };
  team: { email: string; role: string }[];
  gscProperty: string;
  gmbSync: string;
  seoTraffic: { date: string; source: string; metric: string }[];
};

const SITES: Record<string, SiteDetail> = {
  safaeewala: {
    id: "safaeewala",
    domain: "safaeewala.com",
    label: "Safaeewala Cleaning Services LLC",
    location: "Dubai",
    region: "Dubai",
    seoScore: null,
    pagesIndexed: 0,
    newLeads: 0,
    openFixes: 0,
    aiKnowledge: `SERVICE AREA: Dubai + all UAE emirates. Sharjah, Abu Dhabi, Ajman on request.

SERVICES:
- Standard cleaning: same-day availability across Dubai
- Villa deep clean: HD-grade unified checklist, half or full day
- Move-in / move-out cleaning: handover-grade, expanded checklist
- Post-construction cleaning: dust, paint residue, final handover
- Sofa / carpet / curtain / mattress cleaning: on-site steam or wet-clean
- Office cleaning: after-hours, weekend or one-off

HOURS: Sun–Thu 8am–8pm, Fri+Sat 9am–8pm. WhatsApp dispatch 8am–10pm daily.

POLICIES:
- Free cancellation up to 24 hours before the appointment
- Insured team, background-checked staff, uniformed`,
    apiKey: {
      keyId: "key_86339a887beffbb61",
      status: "ACTIVE",
      lastUsed: "used",
      created: "50 ago",
    },
    team: [{ email: "admin@example.com", role: "owner" }],
    gscProperty: "sc-domain:safaeewala.com",
    gmbSync: "Once we can GetToken from Google we will do a smart daily resync on 03:00 / 15:00 UTC.",
    seoTraffic: [
      { date: "2026-07-12", source: "gsc", metric: '{"users":"2","sessions":"2","conversions":"0","engagementRate":"0"}' },
      { date: "2026-07-11", source: "gsc", metric: '{"users":"3","sessions":"3","conversions":"0","engagementRate":"0"}' },
      { date: "2026-07-10", source: "gsc", metric: '{"users":"14","sessions":"14","conversions":"1","engagementRate":"0.86"}' },
      { date: "2026-07-09", source: "gsc", metric: '{"users":"18","sessions":"18","conversions":"1","engagementRate":"0.94"}' },
      { date: "2026-07-08", source: "gsc", metric: '{"clicks":"9","impressions":"3080","ctr":"0","position":"38.4"}' },
      { date: "2026-07-08", source: "ga4", metric: '{"users":"12","sessions":"14","conversions":"1","engagementRate":"0.94"}' },
      { date: "2026-07-07", source: "gsc", metric: '{"clicks":"8","impressions":"2660","ctr":"0","position":"36.1"}' },
    ],
  },
  northwind: {
    id: "northwind",
    domain: "northwindlogistics.io",
    label: "Northwind Logistics",
    location: "London",
    region: "United Kingdom",
    seoScore: 84,
    pagesIndexed: 121,
    newLeads: 22,
    openFixes: 2,
    aiKnowledge: "Freight forwarder covering EU + UK routes; premium service tier.",
    apiKey: { keyId: "key_nw_xxx", status: "ACTIVE", lastUsed: "12h ago", created: "3 mo ago" },
    team: [{ email: "ops@northwind.io", role: "owner" }],
    gscProperty: "sc-domain:northwindlogistics.io",
    gmbSync: "Hourly sync active.",
    seoTraffic: [],
  },
  "aurora-dental": {
    id: "aurora-dental",
    domain: "auroradental.co",
    label: "Aurora Dental Group",
    location: "Toronto",
    region: "Canada",
    seoScore: 71,
    pagesIndexed: 49,
    newLeads: 8,
    openFixes: 7,
    aiKnowledge: "Family + cosmetic dental clinics, 2 locations in Toronto.",
    apiKey: { keyId: "key_ad_xxx", status: "ACTIVE", lastUsed: "1d ago", created: "6 mo ago" },
    team: [{ email: "hello@auroradental.co", role: "owner" }],
    gscProperty: "sc-domain:auroradental.co",
    gmbSync: "Daily sync — 2 locations.",
    seoTraffic: [],
  },
  "atlas-outdoor": {
    id: "atlas-outdoor",
    domain: "atlasoutdoor.shop",
    label: "Atlas Outdoor Co.",
    location: "Denver",
    region: "United States",
    seoScore: 91,
    pagesIndexed: 402,
    newLeads: 63,
    openFixes: 1,
    aiKnowledge: "Outdoor gear e-commerce; Shopify + custom pages.",
    apiKey: { keyId: "key_ao_xxx", status: "ACTIVE", lastUsed: "just now", created: "1 yr ago" },
    team: [{ email: "seo@atlasoutdoor.shop", role: "owner" }],
    gscProperty: "sc-domain:atlasoutdoor.shop",
    gmbSync: "N/A — ecommerce.",
    seoTraffic: [],
  },
};

export const Route = createFileRoute("/sites/$siteId")({
  head: ({ params }) => ({
    meta: [
      { title: `${SITES[params.siteId]?.label ?? "Site"} — AKS SEO Console` },
      {
        name: "description",
        content: "Complete site profile — overview, health, ranks, fixes, pages, GBP, integrations and traffic in one place.",
      },
    ],
  }),
  loader: ({ params }) => {
    if (!SITES[params.siteId]) throw notFound();
    return { site: SITES[params.siteId] };
  },
  component: SiteDetailPage,
  notFoundComponent: () => (
    <div className="p-10 text-center text-slate-400">
      <div className="text-lg font-semibold text-white">Site not found</div>
      <Link to="/connected-sites" className="mt-4 inline-block text-cyan-300 hover:underline">
        ← Back to Connected Sites
      </Link>
    </div>
  ),
});

const TABS = [
  "Overview",
  "Health",
  "Ranks",
  "Fixes",
  "Pages",
  "GBP",
  "Screenshots",
  "Local SEO",
  "QA",
  "Brand",
  "Pricing",
  "Credentials",
];

function SiteDetailPage() {
  const { site } = Route.useLoaderData() as { site: SiteDetail };
  const [tab, setTab] = useState("Overview");

  return (
    <div className="min-h-full text-slate-200">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          <Link to="/connected-sites" className="inline-flex items-center gap-1 hover:text-cyan-200">
            <ArrowLeft className="h-3 w-3" /> Back
          </Link>
          <span>/</span>
          <Link to="/dashboard" className="hover:text-cyan-200">Dashboard</Link>
          <span>/</span>
          <Link to="/connected-sites" className="hover:text-cyan-200">Sites</Link>
          <span>/</span>
          <span className="text-slate-300">{site.label}</span>
        </div>

        {/* Header */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/70">SITE</div>
              <h1 className="mt-1 text-xl font-semibold text-white">{site.label}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
                <a
                  href={`https://${site.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-cyan-300 hover:text-cyan-200"
                >
                  {site.domain} <ExternalLink className="h-3 w-3" />
                </a>
                <span>·</span>
                <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5">{site.location}</span>
                <span>·</span>
                <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5">{site.region}</span>
              </div>
            </div>
            <button
              onClick={() => toast.success("Agent panel opened")}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-cyan-400 to-blue-500 px-3 py-1.5 text-[12px] font-semibold text-slate-950 hover:brightness-110"
            >
              <Bot className="h-3.5 w-3.5" /> Agent panel
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-800">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-t-md border-b-2 px-3 py-1.5 text-[12px] font-medium transition ${
                  tab === t
                    ? "border-cyan-400 text-cyan-200"
                    : "border-transparent text-slate-400 hover:text-cyan-100"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Composite score */}
        <Card title="Composite score">
          <div className="text-[13px] text-slate-300">
            {site.seoScore ?? "—"} · Includes Health, Ranks, Fixes on 7 days
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            No recent data for this site yet. Once the daily scoring job runs, the panel populates automatically.
          </p>
        </Card>

        {/* KPI band */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="SEO Score" value={site.seoScore ?? "—"} />
          <Kpi label="Pages Indexed" value={site.pagesIndexed} />
          <Kpi label="New Leads" value={`${site.newLeads} / 0 total`} />
          <Kpi label="Open Fixes" value={site.openFixes} />
        </div>

        {/* Row of health chips */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Health", "OK"],
            ["Local SEO", "OK"],
            ["Ranks", "—"],
            ["Pages", "—"],
            ["Fixes", "—"],
            ["Screenshots", "OPEN"],
          ].map(([l, v]) => (
            <div key={l} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">{l}</span>
              <span className="text-[12px] font-semibold text-slate-200">{v}</span>
            </div>
          ))}
        </div>

        {/* Site Profile */}
        <Card title="Site Profile">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" value={site.label} />
            <Field label="Domain" value={site.domain} />
            <Field label="City" value={site.location} />
            <Field label="Region" value={site.region} />
          </div>
          <button
            onClick={() => toast.success("Site profile saved")}
            className="mt-3 rounded-md bg-emerald-500/20 px-3 py-1.5 text-[12px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
          >
            Save
          </button>
        </Card>

        {/* AI Knowledge */}
        <Card
          title="AI assistant knowledge"
          subtitle="Paste plain-text facts about this site — service area, services, policies, hours, FAQs. The chat widget and voice booking assistant read this verbatim and use it to answer customer questions."
        >
          <div className="mb-1 text-[11px] text-slate-500">{site.aiKnowledge.length} / 8000 chars</div>
          <textarea
            defaultValue={site.aiKnowledge}
            rows={12}
            className="w-full rounded-md border border-slate-800 bg-slate-950/70 p-3 font-mono text-[11px] text-slate-200 focus:border-cyan-400/50 focus:outline-none"
          />
          <p className="mt-2 text-[11px] text-slate-500">
            Tip: write the facts once, keep it under 4-8k chars. Do not include booking prices/URLs here — the AI answers only from what you provide to avoid customer confusion.
          </p>
          <button
            onClick={() => toast.success("AI knowledge saved")}
            className="mt-2 rounded-md bg-emerald-500/20 px-3 py-1.5 text-[12px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
          >
            Save knowledge
          </button>
        </Card>

        {/* API keys */}
        <Card
          title="API Keys"
          right={
            <button
              onClick={() => toast.success("New API key created")}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/20"
            >
              Rotate (Save new + deactivate old)
            </button>
          }
        >
          <div className="overflow-hidden rounded-md border border-slate-800">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Key ID</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Last Used</th>
                  <th className="px-3 py-2 text-left">Created</th>
                  <th className="px-3 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-800">
                  <td className="px-3 py-2 font-mono text-slate-200">{site.apiKey.keyId}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                      {site.apiKey.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{site.apiKey.lastUsed}</td>
                  <td className="px-3 py-2 text-slate-400">{site.apiKey.created}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => toast("Revoked")}
                      className="text-[11px] text-rose-300 hover:text-rose-200"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Team */}
        <Card title="Team">
          <div className="text-[12px] text-slate-400">No one assigned yet.</div>
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Add a member</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                defaultValue={site.team[0]?.email ?? ""}
                placeholder="admin@example.com"
                className="min-w-[240px] flex-1 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[12px] text-slate-100 focus:border-cyan-400/50 focus:outline-none"
              />
              <button className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[12px] text-slate-200">
                writer <ChevronDown className="h-3 w-3" />
              </button>
              <button
                onClick={() => toast.success("Member invited")}
                className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-[12px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
              >
                Add
              </button>
            </div>
          </div>
        </Card>

        {/* Recent leads */}
        <Card title="Recent leads" right={<Link to="/dashboard" className="text-[11px] text-cyan-300 hover:underline">View all →</Link>}>
          <div className="text-[12px] text-slate-500">No leads yet for this site.</div>
        </Card>

        {/* Tasks */}
        <Card
          title="Tasks"
          subtitle={<>Assigned work for this site. Drag-and-drop kanban view at <Link to="/assign-tasks" className="text-cyan-300 hover:underline">/admin/tasks?site={site.domain}</Link></>}
          right={
            <button
              onClick={() => toast.success("New task created")}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
            >
              <Plus className="h-3 w-3" /> New task
            </button>
          }
        >
          <div className="grid grid-cols-3 gap-3 text-center">
            {["Open", "Doing", "Completed"].map((s) => (
              <div key={s} className="rounded-md border border-slate-800 bg-slate-950/60 py-3">
                <div className="text-2xl font-semibold text-white">0</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{s}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center text-[12px] text-slate-500">
            No tasks for this site yet.
            <div className="mt-2">
              <button
                onClick={() => toast.success("First task created")}
                className="text-[12px] text-cyan-300 hover:underline"
              >
                Create the first task +
              </button>
            </div>
          </div>
        </Card>

        {/* Integrations */}
        <Card
          title="Integrations"
          subtitle="Connect the WordPress site and Google to capture leads and pull traffic data."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <IntegrationBlock name="WordPress" status="disconnected" detail="Google + agents — no signals to date." />
            <IntegrationBlock name="Google (GSC + GA4)" status="reconnect" detail="Property 342118 — 3 accounts · Analytics 4" />
          </div>
        </Card>

        {/* GSC property */}
        <Card title="GSC PROPERTY - GSC connected to the site to enable measurement">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={site.gscProperty}
              className="flex-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-1.5 font-mono text-[11px] text-slate-300"
            />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(site.gscProperty);
                toast.success("GSC property saved");
              }}
              className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
            >
              Save GSC property
            </button>
          </div>
        </Card>

        {/* GMB SYNC */}
        <Card title="GMB Sync">
          <p className="text-[12px] text-slate-400">{site.gmbSync}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => toast.success("GSC sync triggered")}
              className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
            >
              Sync GSC now
            </button>
            <button
              onClick={() => toast.success("GA4 sync triggered")}
              className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
            >
              Sync GA4 now
            </button>
          </div>
        </Card>

        {/* SEO / Traffic table */}
        <Card title="SEO / Traffic (last 14 days)">
          <div className="overflow-x-auto rounded-md border border-slate-800">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Metrics</th>
                </tr>
              </thead>
              <tbody>
                {site.seoTraffic.map((row, i) => (
                  <tr key={i} className="border-t border-slate-800/70">
                    <td className="px-3 py-1.5 text-slate-300">{row.date}</td>
                    <td className="px-3 py-1.5 uppercase text-cyan-300">{row.source}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-400">{row.metric}</td>
                  </tr>
                ))}
                {site.seoTraffic.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                      No traffic rows yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Danger zone */}
        <Card title="Danger zone">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-white">Delete this site</div>
              <p className="text-[11px] text-slate-500">Removes the site and stops all syncs. This cannot be undone.</p>
            </div>
            <button
              onClick={() => {
                if (confirm(`Delete ${site.label}? This cannot be undone.`)) {
                  toast.success(`${site.label} deleted`);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20"
            >
              <Trash2 className="h-3 w-3" /> Delete site
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
            {title}
          </h2>
          {subtitle && <div className="mt-1 max-w-3xl text-[12px] text-slate-400">{subtitle}</div>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <input
        defaultValue={value}
        className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[12px] text-slate-200 focus:border-cyan-400/50 focus:outline-none"
      />
    </div>
  );
}

function IntegrationBlock({
  name,
  status,
  detail,
}: {
  name: string;
  status: "connected" | "reconnect" | "disconnected";
  detail: string;
}) {
  const pill =
    status === "connected"
      ? { text: "CONNECTED", cls: "bg-emerald-500/20 text-emerald-200" }
      : status === "reconnect"
        ? { text: "RECONNECT", cls: "bg-amber-500/20 text-amber-200" }
        : { text: "DISCONNECTED", cls: "bg-slate-700/60 text-slate-300" };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-white">{name}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pill.cls}`}>{pill.text}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}
