import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Lightbulb,
  ArrowUpRight,
  Link2,
  FileText,
  Gauge,
  Users,
  ListChecks,
  TrendingUp,
  Zap,
  Filter,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/suggestions")({
  head: () => ({
    meta: [
      { title: "Suggestions — AKS SEO Console" },
      { name: "description", content: "Prioritized SEO opportunities across Off-Page, On-Page and Technical, surfaced by your agent fleet." },
      { property: "og:title", content: "Suggestions — AKS SEO Console" },
      { property: "og:description", content: "Ranked SEO recommendations from your agents, grouped by pillar." },
    ],
  }),
  component: SuggestionsPage,
});

type Impact = "High" | "Medium" | "Low";
type Effort = "S" | "M" | "L";

type Suggestion = {
  id: string;
  title: string;
  desc: string;
  impact: Impact;
  effort: Effort;
  assigned?: string;
};

type Section = {
  id: "offpage" | "onpage" | "technical";
  label: string;
  tagline: string;
  icon: typeof Link2;
  from: string;
  to: string;
  accent: string;
  items: Suggestion[];
};

const SECTIONS: Section[] = [
  {
    id: "offpage",
    label: "Off-Page SEO",
    tagline: "Authority, backlinks and brand mentions",
    icon: Link2,
    from: "#fb7185",
    to: "#ec4899",
    accent: "from-rose-400 to-pink-500",
    items: [
      { id: "o1", title: "Reclaim 8 unlinked brand mentions", desc: "UAE lifestyle blogs mention the brand without linking. Pitch a 1-line link add.", impact: "High", effort: "S", assigned: "Outreach Agent" },
      { id: "o2", title: "Pitch 5 UAE real-estate blogs for guest posts", desc: "High DR real-estate outlets accept 'move-in cleaning' guides.", impact: "High", effort: "M" },
      { id: "o3", title: "Submit to 12 missing UAE directories", desc: "Yalla, Connect.ae and Dubai Chamber listings are missing.", impact: "Medium", effort: "S", assigned: "Local Agent" },
      { id: "o4", title: "Recover 4 broken backlinks (301 targets)", desc: "Old service URLs return 404 — redirect to live equivalents.", impact: "Medium", effort: "S" },
    ],
  },
  {
    id: "onpage",
    label: "On-Page SEO",
    tagline: "Content, meta, headings and internal links",
    icon: FileText,
    from: "#34d399",
    to: "#14b8a6",
    accent: "from-emerald-400 to-teal-500",
    items: [
      { id: "p1", title: "Consolidate 3 competing pages on 'deep cleaning Dubai'", desc: "Merge duplicates into a single canonical hub to concentrate authority.", impact: "High", effort: "M", assigned: "Content Strategist" },
      { id: "p2", title: "Add FAQ schema to 12 top-performing service pages", desc: "Eligible for rich results; expected +8% CTR on service queries.", impact: "High", effort: "S" },
      { id: "p3", title: "Rewrite meta titles on 22 area pages", desc: "Include 'Dubai' + service + USP under 60 chars.", impact: "Medium", effort: "S", assigned: "Meta Optimizer" },
      { id: "p4", title: "Refresh 5 posts with declining traffic", desc: "Update stats, add 2026 examples, expand FAQ.", impact: "Medium", effort: "M" },
      { id: "p5", title: "Internal-link 18 orphan blog posts", desc: "Add contextual links from 3 hub pages each.", impact: "Medium", effort: "S" },
      { id: "p6", title: "Add hreflang ar-AE / en-AE on 40 URLs", desc: "Currently missing on Arabic translations.", impact: "Low", effort: "S" },
    ],
  },
  {
    id: "technical",
    label: "Technical SEO",
    tagline: "Crawl, speed, indexation and Core Web Vitals",
    icon: Gauge,
    from: "#818cf8",
    to: "#3b82f6",
    accent: "from-indigo-400 to-blue-500",
    items: [
      { id: "t1", title: "Improve LCP on /pricing (currently 3.1s)", desc: "Preload hero image, defer 3rd-party scripts.", impact: "High", effort: "M", assigned: "Technical Agent" },
      { id: "t2", title: "Fix 14 canonical mismatches", desc: "Self-referencing canonicals point to trailing-slash variants.", impact: "High", effort: "S" },
      { id: "t3", title: "Submit updated XML sitemap to GSC", desc: "42 new area pages missing from current sitemap.", impact: "Medium", effort: "S" },
      { id: "t4", title: "Compress 87 unoptimized images (>500KB)", desc: "Convert to WebP, resize to display width.", impact: "Medium", effort: "M" },
    ],
  },
];

function SuggestionsPage() {
  const total = SECTIONS.reduce((n, s) => n + s.items.length, 0);
  const assigned = SECTIONS.reduce((n, s) => n + s.items.filter((i) => i.assigned).length, 0);
  const high = SECTIONS.reduce((n, s) => n + s.items.filter((i) => i.impact === "High").length, 0);
  const quickWins = SECTIONS.reduce(
    (n, s) => n + s.items.filter((i) => i.effort === "S" && i.impact !== "Low").length,
    0,
  );

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Recommendations · Prioritized
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Suggestions</h1>
            <p className="mt-1 text-sm text-slate-400">
              Ranked SEO opportunities surfaced by your agent fleet, grouped by pillar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800">
              <Filter className="h-4 w-4" /> Filter
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-400/20">
              <Sparkles className="h-4 w-4" /> Generate new
            </button>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Total suggestions"
            value={total}
            sub="Across all pillars"
            percent={100}
            from="#22d3ee"
            to="#0ea5e9"
            icon={ListChecks}
          />
          <KpiCard
            label="Assigned"
            value={assigned}
            sub={`${total ? Math.round((assigned / total) * 100) : 0}% of backlog`}
            percent={total ? (assigned / total) * 100 : 0}
            from="#c084fc"
            to="#e879f9"
            icon={Users}
          />
          <KpiCard
            label="High impact"
            value={high}
            sub="Ship these first"
            percent={total ? (high / total) * 100 : 0}
            from="#f87171"
            to="#ec4899"
            icon={TrendingUp}
          />
          <KpiCard
            label="Quick wins"
            value={quickWins}
            sub="Low effort, real lift"
            percent={total ? (quickWins / total) * 100 : 0}
            from="#34d399"
            to="#14b8a6"
            icon={Zap}
          />
        </section>

        {/* Sections */}
        <div className="mt-8 space-y-6">
          {SECTIONS.map((s) => (
            <SectionBlock key={s.id} section={s} />
          ))}
        </div>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function SectionBlock({ section }: { section: Section }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = section.icon;
  const previewCount = 3;
  const items = expanded ? section.items : section.items.slice(0, previewCount);
  const remaining = section.items.length - previewCount;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(to right, ${section.from}, ${section.to})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.07] blur-3xl"
        style={{ background: `radial-gradient(circle, ${section.from}, transparent 70%)` }}
      />

      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-950 shadow"
            style={{ background: `linear-gradient(135deg, ${section.from}, ${section.to})` }}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">{section.label}</h2>
            <div className="text-[11px] text-slate-500">{section.tagline}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
            {section.items.length} items
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{
              color: section.from,
              background: `color-mix(in oklab, ${section.from} 12%, transparent)`,
              border: `1px solid color-mix(in oklab, ${section.from} 25%, transparent)`,
            }}
          >
            {section.items.filter((i) => i.impact === "High").length} high impact
          </span>
        </div>
      </div>

      {/* Items */}
      <ul className="divide-y divide-slate-800/70">
        {items.map((item) => (
          <SuggestionRow key={item.id} item={item} accent={section.accent} tint={section.from} />
        ))}
      </ul>

      {/* Footer / View all */}
      {section.items.length > previewCount && (
        <div className="flex items-center justify-between border-t border-slate-800/70 bg-slate-950/40 px-5 py-3">
          <div className="text-[11px] text-slate-500">
            Showing {items.length} of {section.items.length}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-400/40 hover:bg-slate-800 hover:text-cyan-200"
          >
            {expanded ? "Show less" : `View all (${remaining} more)`}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}

function SuggestionRow({
  item,
  accent,
  tint,
}: {
  item: Suggestion;
  accent: string;
  tint: string;
}) {
  const impactStyle: Record<Impact, string> = {
    High: "bg-rose-400/10 text-rose-300 border-rose-400/20",
    Medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    Low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
  const effortLabel: Record<Effort, string> = { S: "S · Quick", M: "M · Focused", L: "L · Project" };

  return (
    <li className="group relative flex items-start justify-between gap-4 px-5 py-4 transition hover:bg-slate-900/60">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${accent} text-slate-950`}
        >
          <Lightbulb className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white leading-snug">{item.title}</div>
          <div className="mt-0.5 text-xs text-slate-400">{item.desc}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${impactStyle[item.impact]}`}
            >
              {item.impact} impact
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
              {effortLabel[item.effort]}
            </span>
            {item.assigned && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
                style={{
                  color: tint,
                  background: `color-mix(in oklab, ${tint} 10%, transparent)`,
                  border: `1px solid color-mix(in oklab, ${tint} 22%, transparent)`,
                }}
              >
                <Users className="h-3 w-3" /> {item.assigned}
              </span>
            )}
          </div>
        </div>
      </div>
      <Link
        to="/suggestions"
        className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-300 transition group-hover:border-cyan-400/40 group-hover:text-cyan-200"
      >
        Review <ArrowUpRight className="h-3 w-3" />
      </Link>
    </li>
  );
}

function KpiCard({
  label,
  value,
  sub,
  percent,
  from,
  to,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  percent: number;
  from: string;
  to: string;
  icon: typeof Zap;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const gradId = `kpi-${label.replace(/\s+/g, "-")}`;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900/70">
      <div
        aria-hidden
        className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20"
        style={{ background: `radial-gradient(circle, ${from}, transparent 70%)` }}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
            <Icon className="h-3 w-3" style={{ color: from }} /> {label}
          </div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight text-white tabular-nums">
            {value}
          </div>
          {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
        </div>
        <div className="relative shrink-0">
          <svg width={size} height={size} className="-rotate-90">
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={from} />
                <stop offset="100%" stopColor={to} />
              </linearGradient>
            </defs>
            <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(30 41 59)" strokeWidth={stroke} fill="none" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={`url(#${gradId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${dash} ${c}`}
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-semibold text-slate-300 tabular-nums">
            {Math.round(pct)}%
          </div>
        </div>
      </div>
    </div>
  );
}
