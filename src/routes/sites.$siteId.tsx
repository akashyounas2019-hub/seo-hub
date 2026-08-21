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
  Layers,
  Sparkles,
  ShieldAlert,
  HelpCircle,
  FileText,
  Building2,
  Tag,
  type LucideIcon,
} from "lucide-react";
import type { StructuredKnowledgeBase, KbServiceItem, KbFaqItem, KbPolicyItem, KbCompetitorItem } from "../db/schema";
import { compileFullKnowledge, formatStructuredKb } from "../lib/ai-knowledge";

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
  structuredKb?: StructuredKnowledgeBase;
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
    structuredKb: {
      businessProfile: {
        businessName: "Safaeewala Cleaning Services LLC",
        niche: "Residential & Commercial Deep Cleaning",
        phone: "+971 4 399 0000",
        whatsapp: "+971 50 123 4567",
        address: "Cluster T, Jumeirah Lakes Towers, Dubai, UAE",
        workingHours: "Sun-Thu: 8:00 AM - 8:00 PM, Fri-Sat: 9:00 AM - 6:00 PM",
        tradeLicense: "CN-1094829",
        establishedYear: "2019",
      },
      services: [
        {
          id: "s1",
          name: "Villa Deep Cleaning",
          category: "Deep Clean",
          description: "Handover-grade villa refresh using written 60-point checklist",
          priceAed: "499",
          turnaround: "4-6 Hours",
          keywords: ["villa deep cleaning dubai", "villa handover clean"],
          features: ["Inside appliance clean", "Balcony washing", "AC vent dusting"],
        },
        {
          id: "s2",
          name: "Move-in / Move-out Cleaning",
          category: "Tenancy Clean",
          description: "Tenancy agreement handover clean guaranteed to return deposit",
          priceAed: "349",
          turnaround: "3-5 Hours",
          keywords: ["move out cleaning dubai", "tenancy cleaning dubai"],
          features: ["Cabinet interior scrubbing", "Grout steam cleaning"],
        },
        {
          id: "s3",
          name: "Sofa & Upholstery Steam Clean",
          category: "Specialized",
          description: "On-site hot water extraction and germ disinfection",
          priceAed: "199",
          turnaround: "1-2 Hours",
          keywords: ["sofa cleaning dubai", "carpet steam clean"],
          features: ["Stain removal", "Quick-dry extraction"],
        },
      ],
      brandTone: {
        tone: "Professional, punctual, trustworthy, Dubai-market localized",
        usps: ["60-point quality audit checklist", "Insured & background-checked staff", "Eco-friendly non-toxic products"],
        rulesDos: ["Emphasize Dubai Municipality compliance", "Provide clear AED quotes upfront", "Highlight English & Arabic customer service"],
        rulesDonts: ["Never make unverified medical claims", "Never omit VAT info in quotes"],
        targetPersonas: ["Expats moving into new villas", "Property managers", "Families requiring seasonal deep cleans"],
      },
      faqs: [
        {
          id: "f1",
          category: "Booking",
          question: "Are cleaning equipment and supplies provided?",
          answer: "Yes, our team brings all professional tools, eco-friendly detergents, steam machines, and vacuums at no extra charge.",
        },
        {
          id: "f2",
          category: "Policies",
          question: "What is your cancellation policy?",
          answer: "Free cancellation or rescheduling up to 24 hours prior to appointment time.",
        },
      ],
      policies: [
        {
          id: "p1",
          title: "Deposit Return Guarantee",
          description: "If your landlord or property manager flags any cleaning defect within 48 hours, we re-clean for free.",
        },
      ],
      competitors: [
        {
          id: "c1",
          name: "JustClean / UrbanCompany",
          domain: "justclean.com",
          counterStrategy: "Emphasize dedicated in-house staff rather than unvetted gig marketplace freelancers.",
        },
      ],
    },
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

        {/* AI Agent Knowledge Studio */}
        <KnowledgeStudio site={site} />

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

function KnowledgeStudio({ site }: { site: SiteDetail }) {
  const [activeTab, setActiveTab] = useState<
    "text" | "services" | "brand" | "faqs" | "policies" | "competitors" | "preview"
  >("services");

  const [plainText, setPlainText] = useState(site.aiKnowledge);
  const [structured, setStructured] = useState<StructuredKnowledgeBase>(
    site.structuredKb || {
      businessProfile: {
        businessName: site.label,
        niche: "Cleaning Services",
        phone: "+971 4 000 0000",
        workingHours: "Sun-Thu 8am-8pm",
      },
      services: [],
      faqs: [],
      policies: [],
      competitors: [],
    }
  );

  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [newServiceCat, setNewServiceCat] = useState("");
  const [newFaqQ, setNewFaqQ] = useState("");
  const [newFaqA, setNewFaqA] = useState("");

  const addService = () => {
    if (!newServiceName.trim()) return;
    const item: KbServiceItem = {
      id: `s_${Date.now()}`,
      name: newServiceName.trim(),
      priceAed: newServicePrice.trim() || undefined,
      category: newServiceCat.trim() || "General",
    };
    setStructured((prev) => ({
      ...prev,
      services: [...(prev.services || []), item],
    }));
    setNewServiceName("");
    setNewServicePrice("");
    setNewServiceCat("");
    toast.success(`Added service: ${item.name}`);
  };

  const addFaq = () => {
    if (!newFaqQ.trim() || !newFaqA.trim()) return;
    const item: KbFaqItem = {
      id: `f_${Date.now()}`,
      question: newFaqQ.trim(),
      answer: newFaqA.trim(),
    };
    setStructured((prev) => ({
      ...prev,
      faqs: [...(prev.faqs || []), item],
    }));
    setNewFaqQ("");
    setNewFaqA("");
    toast.success("Added new FAQ item");
  };

  const compiledPrompt = compileFullKnowledge({
    siteName: site.label,
    city: site.location,
    plainTextKb: plainText,
    structuredKb: structured,
  });

  return (
    <Card
      title="AI Agent Knowledge Studio"
      subtitle="Comprehensive knowledge hub containing website project facts, service catalogs, pricing rules, brand voice, FAQs, and competitor positioning. All background AI agents read this data to ground their outputs."
      right={
        <button
          onClick={() => toast.success("Knowledge Studio updated & saved to PostgreSQL")}
          className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-[12px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
        >
          Save Knowledge Studio
        </button>
      }
    >
      {/* Studio Sub-Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-800 pb-2">
        {[
          { id: "services", label: "Services & Pricing", icon: Layers, count: structured.services?.length },
          { id: "brand", label: "Brand Voice & Personas", icon: Sparkles },
          { id: "faqs", label: "FAQs & Q&A", icon: HelpCircle, count: structured.faqs?.length },
          { id: "policies", label: "Policies & Guarantees", icon: ShieldAlert, count: structured.policies?.length },
          { id: "competitors", label: "Competitors", icon: Tag, count: structured.competitors?.length },
          { id: "text", label: "Raw Plain-Text Facts", icon: FileText },
          { id: "preview", label: "Agent Prompt Dry-Run", icon: Bot },
        ].map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
                active
                  ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.2 text-[9px] text-cyan-300">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1. Services & Pricing Catalog Tab */}
      {activeTab === "services" && (
        <div className="space-y-4">
          <div className="grid gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-4">
            <input
              placeholder="Service Name (e.g. Sofa Steam Clean)"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            />
            <input
              placeholder="Category (e.g. Deep Clean)"
              value={newServiceCat}
              onChange={(e) => setNewServiceCat(e.target.value)}
              className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            />
            <input
              placeholder="Price AED (e.g. 299)"
              value={newServicePrice}
              onChange={(e) => setNewServicePrice(e.target.value)}
              className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[12px] text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            />
            <button
              onClick={addService}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-cyan-500/20 px-3 py-1.5 text-[12px] font-semibold text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-500/30"
            >
              <Plus className="h-3.5 w-3.5" /> Add Service
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Service</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Price (AED)</th>
                  <th className="px-3 py-2 text-left">Turnaround</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(structured.services || []).map((s) => (
                  <tr key={s.id} className="border-t border-slate-800/60 hover:bg-slate-900/30">
                    <td className="px-3 py-2 font-medium text-white">
                      {s.name}
                      {s.description && <div className="text-[10px] text-slate-400">{s.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{s.category || "General"}</td>
                    <td className="px-3 py-2 font-mono text-cyan-300">{s.priceAed ? `${s.priceAed} AED` : "Quote"}</td>
                    <td className="px-3 py-2 text-slate-400">{s.turnaround || "Same Day"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          setStructured((prev) => ({
                            ...prev,
                            services: prev.services?.filter((item) => item.id !== s.id),
                          }));
                          toast.info("Service removed");
                        }}
                        className="text-[11px] text-rose-400 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {(!structured.services || structured.services.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No services added to catalog yet. Add your first service above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Brand Voice & Personas Tab */}
      {activeTab === "brand" && (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Tone of Voice</div>
            <input
              defaultValue={structured.brandTone?.tone || "Professional, punctual, trustworthy, Dubai-market localized"}
              onChange={(e) =>
                setStructured((prev) => ({
                  ...prev,
                  brandTone: { ...(prev.brandTone || {}), tone: e.target.value },
                }))
              }
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[12px] text-slate-200 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Brand Rules - DOs (semicolon separated)</div>
              <textarea
                rows={3}
                defaultValue={(structured.brandTone?.rulesDos || []).join("; ")}
                onChange={(e) =>
                  setStructured((prev) => ({
                    ...prev,
                    brandTone: {
                      ...(prev.brandTone || {}),
                      rulesDos: e.target.value.split(";").map((s) => s.trim()).filter(Boolean),
                    },
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/70 p-2 text-[11px] text-slate-200 focus:border-cyan-400/50 focus:outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Brand Rules - DON'Ts (semicolon separated)</div>
              <textarea
                rows={3}
                defaultValue={(structured.brandTone?.rulesDonts || []).join("; ")}
                onChange={(e) =>
                  setStructured((prev) => ({
                    ...prev,
                    brandTone: {
                      ...(prev.brandTone || {}),
                      rulesDonts: e.target.value.split(";").map((s) => s.trim()).filter(Boolean),
                    },
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/70 p-2 text-[11px] text-slate-200 focus:border-cyan-400/50 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. FAQs Tab */}
      {activeTab === "faqs" && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <input
              placeholder="Question (e.g. What is included in villa deep clean?)"
              value={newFaqQ}
              onChange={(e) => setNewFaqQ(e.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[12px] text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            />
            <textarea
              placeholder="Verified Answer for AI response grounding..."
              rows={2}
              value={newFaqA}
              onChange={(e) => setNewFaqA(e.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-900/60 p-3 text-[12px] text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            />
            <button
              onClick={addFaq}
              className="inline-flex items-center gap-1 rounded-md bg-cyan-500/20 px-3 py-1.5 text-[12px] font-semibold text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-500/30"
            >
              <Plus className="h-3.5 w-3.5" /> Add FAQ Item
            </button>
          </div>

          <div className="space-y-2">
            {(structured.faqs || []).map((f) => (
              <div key={f.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-cyan-200 text-[12px]">Q: {f.question}</div>
                  <button
                    onClick={() => {
                      setStructured((prev) => ({
                        ...prev,
                        faqs: prev.faqs?.filter((item) => item.id !== f.id),
                      }));
                      toast.info("FAQ removed");
                    }}
                    className="text-[10px] text-rose-400 hover:underline"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-slate-300">A: {f.answer}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Policies Tab */}
      {activeTab === "policies" && (
        <div className="space-y-2">
          {(structured.policies || []).map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="font-semibold text-white text-[12px]">{p.title}</div>
              <div className="mt-1 text-[11px] text-slate-400">{p.description}</div>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">
            Policies defined here dictate return guarantees, deposit refunds, and insurance terms for AI response validation.
          </p>
        </div>
      )}

      {/* 5. Competitors Tab */}
      {activeTab === "competitors" && (
        <div className="space-y-2">
          {(structured.competitors || []).map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="font-semibold text-white text-[12px]">{c.name} {c.domain && `(${c.domain})`}</div>
              <div className="mt-1 text-[11px] text-slate-400">Counter Strategy: {c.counterStrategy}</div>
            </div>
          ))}
        </div>
      )}

      {/* 6. Raw Plain Text Tab */}
      {activeTab === "text" && (
        <div>
          <div className="mb-1 text-[11px] text-slate-500">{plainText.length} / 8000 chars</div>
          <textarea
            value={plainText}
            onChange={(e) => setPlainText(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-slate-800 bg-slate-950/70 p-3 font-mono text-[11px] text-slate-200 focus:border-cyan-400/50 focus:outline-none"
          />
        </div>
      )}

      {/* 7. Live Agent Prompt Dry-Run Preview */}
      {activeTab === "preview" && (
        <div>
          <div className="mb-2 text-[11px] text-slate-400">
            Live compiled Knowledge Base text injected into AI worker prompts when executing tasks for this site:
          </div>
          <pre className="max-h-[350px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/90 p-4 font-mono text-[11px] text-cyan-200">
            {compiledPrompt}
          </pre>
        </div>
      )}
    </Card>
  );
}

