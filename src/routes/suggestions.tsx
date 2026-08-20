import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { jobsStore } from "@/lib/jobs-store";
import { TaskItemDetailModal } from "@/features/tasks/components/task-item-detail-modal";
import type { Task } from "@/features/tasks/types";
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
  Bot,
  Calendar,
  PenLine,
  Repeat,
  PlayCircle,
  Workflow,
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
    from: "#38bdf8",
    to: "#6366f1",
    accent: "from-sky-400 to-indigo-500",
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

type Automation = {
  id: string;
  title: string;
  desc: string;
  agent: string;
  agentIcon: typeof PenLine;
  cadence: string;
  trigger: string;
  nextRun: string;
  lift: string;
  impact: Impact;
};

const AUTOMATIONS: Automation[] = [
  {
    id: "a1",
    title: "Schedule 8 blog posts with Blog Writer for Ramadan season",
    desc: "Auto-brief, draft and queue 'Ramadan deep cleaning' + 'iftar prep cleaning' posts to publish Feb 12 – Mar 3.",
    agent: "Blog Writer",
    agentIcon: PenLine,
    cadence: "One-off · 8 posts",
    trigger: "Feb 12, 2026 · 09:00 GST",
    nextRun: "Starts in 6 days",
    lift: "+22% seasonal traffic",
    impact: "High",
  },
  {
    id: "a2",
    title: "Auto-publish weekly GBP post every Monday 9 AM",
    desc: "Hand Content Strategist → GBP Publisher: rotate offers, service highlights and area spotlights.",
    agent: "GBP Publisher",
    agentIcon: Calendar,
    cadence: "Weekly · Mon 09:00",
    trigger: "Recurring schedule",
    nextRun: "Next: Mon 09:00 GST",
    lift: "+14% GBP calls",
    impact: "High",
  },
  {
    id: "a3",
    title: "Trigger review request 2h after every completed job",
    desc: "CRM 'job completed' webhook → Review Agent sends bilingual WhatsApp + email request.",
    agent: "Review Agent",
    agentIcon: Repeat,
    cadence: "Real-time",
    trigger: "CRM webhook",
    nextRun: "Live · avg 42 / week",
    lift: "3.4× review velocity",
    impact: "High",
  },
  {
    id: "a4",
    title: "Refresh 5 declining posts on the 1st of each month",
    desc: "Meta Optimizer + Content Strategist auto-update stats, FAQ and internal links on flagged URLs.",
    agent: "Content Strategist",
    agentIcon: FileText,
    cadence: "Monthly · 1st 08:00",
    trigger: "Traffic drop > 20%",
    nextRun: "Next: Feb 1, 08:00",
    lift: "Recover ~1.2k sessions",
    impact: "Medium",
  },
  {
    id: "a5",
    title: "Auto-outreach when a new UAE brand mention is detected",
    desc: "Mention listener → Outreach Agent drafts a 1-line link-add pitch and queues for approval.",
    agent: "Outreach Agent",
    agentIcon: Bot,
    cadence: "Real-time",
    trigger: "New unlinked mention",
    nextRun: "Live · 3 pending",
    lift: "+6 DR links / mo",
    impact: "Medium",
  },
];

const GENERATED_POOL: { sectionId: Section["id"]; item: Omit<Suggestion, "id"> }[] = [
  { sectionId: "onpage", item: { title: "Add 'People Also Ask' section to top 10 blog posts", desc: "Mine PAA from GSC and integrate as H3 blocks to capture featured snippets.", impact: "High", effort: "M" } },
  { sectionId: "technical", item: { title: "Enable HTTP/3 on origin", desc: "Reduce handshake overhead for mobile users on flaky connections.", impact: "Medium", effort: "S" } },
  { sectionId: "offpage", item: { title: "Sponsor 2 UAE community newsletters", desc: "Niche audience overlap · earn contextual DR55+ links with brand lift.", impact: "High", effort: "M" } },
  { sectionId: "onpage", item: { title: "Add author bios with sameAs to 24 posts", desc: "E-E-A-T signals; link to LinkedIn + industry profiles.", impact: "Medium", effort: "S" } },
  { sectionId: "technical", item: { title: "Prerender critical listing pages", desc: "Cut TTFB from 1.4s → 200ms on cached edge nodes.", impact: "High", effort: "L" } },
  { sectionId: "offpage", item: { title: "Reclaim 3 stolen image citations", desc: "Reverse-image search revealed uncredited use; request attribution links.", impact: "Medium", effort: "S" } },
];

function SuggestionsPage() {
  const [sections, setSections] = useState<Section[]>(SECTIONS);
  const [generating, setGenerating] = useState(false);
  const [genCursor, setGenCursor] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [impactFilter, setImpactFilter] = useState<Impact | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const assigned = sections.reduce((n, s) => n + s.items.filter((i) => i.assigned).length, 0);
  const high = sections.reduce((n, s) => n + s.items.filter((i) => i.impact === "High").length, 0);
  const quickWins = sections.reduce(
    (n, s) => n + s.items.filter((i) => i.effort === "S" && i.impact !== "Low").length,
    0,
  );

  const handleGenerate = () => {
    if (generating) return;
    setGenerating(true);
    toast.info("Enqueuing suggestion mining task in AKS worker queue...");

    // Create a new AKS AI Job in queue
    const job = jobsStore.create({
      kind: "seo:suggestion-gen",
      title: "Mine new SEO opportunities via LLM Scout",
      input: {
        existingCount: total,
        domain: "safaeewala.com",
      },
      priority: "normal",
    });

    // Simulate worker process loop
    setTimeout(() => {
      jobsStore.claim("aks-worker-scout-bot");

      setTimeout(() => {
        jobsStore.heartbeat(job.id);

        setTimeout(() => {
          const pick = GENERATED_POOL[genCursor % GENERATED_POOL.length];
          const newId = `gen-${Date.now()}`;

          jobsStore.complete(job.id, `### Opportunity Identified
- **Title**: ${pick.item.title}
- **Description**: ${pick.item.desc}
- **Pillar**: ${pick.sectionId}
- **Impact**: ${pick.item.impact}
- **Effort**: ${pick.item.effort}`, 1600);

          setSections((prev) =>
            prev.map((s) =>
              s.id === pick.sectionId
                ? { ...s, items: [{ id: newId, ...pick.item }, ...s.items] }
                : s,
            ),
          );

          setGenCursor((c) => c + 1);
          setFlashId(newId);
          setGenerating(false);
          toast.success("AKS worker completed suggestion generation!");
          setTimeout(() => setFlashId((v) => (v === newId ? null : v)), 2400);
        }, 1200);
      }, 500);
    }, 500);
  };

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
            <div className="relative">
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                  impactFilter !== "all" || filterOpen
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Filter className="h-4 w-4" /> Filter
                {impactFilter !== "all" && (
                  <span className="ml-1 rounded-full bg-cyan-400/25 px-1.5 text-[10px] font-semibold text-cyan-100">{impactFilter}</span>
                )}
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/95 shadow-xl backdrop-blur">
                  <div className="border-b border-slate-800 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">Impact</div>
                  {(["all", "High", "Medium", "Low"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        setImpactFilter(v);
                        setFilterOpen(false);
                        if (v !== "all") toast.success(`Filtered by ${v} impact`);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${
                        impactFilter === v ? "bg-cyan-400/10 text-cyan-100" : "text-slate-300 hover:bg-slate-900"
                      }`}
                    >
                      <span>{v === "all" ? "All impacts" : `${v} impact`}</span>
                      {impactFilter === v && <span className="text-cyan-300">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              aria-busy={generating}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Generating…" : "Generate new"}
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
            from="#fbbf24"
            to="#f59e0b"
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

        {/* Sections ordered by On-Page -> Technical -> Automation -> Off-Page */}
        <div className="mt-8 space-y-6">
          {/* 1. On-Page */}
          {(() => {
            const onPageSection = sections.find((s) => s.id === "onpage");
            if (!onPageSection) return null;
            const s = impactFilter === "all" ? onPageSection : { ...onPageSection, items: onPageSection.items.filter((i) => i.impact === impactFilter) };
            return <SectionBlock key={s.id} section={s} flashId={flashId} />;
          })()}

          {/* 2. Technical */}
          {(() => {
            const techSection = sections.find((s) => s.id === "technical");
            if (!techSection) return null;
            const s = impactFilter === "all" ? techSection : { ...techSection, items: techSection.items.filter((i) => i.impact === impactFilter) };
            return <SectionBlock key={s.id} section={s} flashId={flashId} />;
          })()}

          {/* 3. Automation */}
          <AutomationSuggestions />

          {/* 4. Off-Page */}
          {(() => {
            const offPageSection = sections.find((s) => s.id === "offpage");
            if (!offPageSection) return null;
            const s = impactFilter === "all" ? offPageSection : { ...offPageSection, items: offPageSection.items.filter((i) => i.impact === impactFilter) };
            return <SectionBlock key={s.id} section={s} flashId={flashId} />;
          })()}
        </div>

        <div aria-hidden className="h-16" />
      </div>
    </div>
  );
}

function AutomationSuggestions() {
  const [expanded, setExpanded] = useState(false);
  const previewCount = 3;
  const items = expanded ? AUTOMATIONS : AUTOMATIONS.slice(0, previewCount);
  const remaining = AUTOMATIONS.length - previewCount;
  const from = "#22d3ee";
  const to = "#a855f7";

  const impactStyle: Record<Impact, string> = {
    High: "bg-amber-400/10 text-amber-200 border-amber-400/25",
    Medium: "bg-sky-400/10 text-sky-200 border-sky-400/25",
    Low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(to right, ${from}, ${to})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.08] blur-3xl"
        style={{ background: `radial-gradient(circle, ${from}, transparent 70%)` }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-950 shadow"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
          >
            <Workflow className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Automation Suggestions</h2>
            <div className="text-[11px] text-slate-500">
              Tasks and workflows your agents can run on a schedule or trigger
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
            {AUTOMATIONS.length} candidates
          </span>
          <Link
            to="/automation"
            className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-200 hover:bg-cyan-400/20"
          >
            Open studio <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Items */}
      <ul className="divide-y divide-slate-800/70">
        {items.map((a) => {
          const AgentIcon = a.agentIcon;
          return (
            <li
              key={a.id}
              className="group relative grid gap-4 px-5 py-4 transition hover:bg-slate-900/60 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-950"
                  style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white leading-snug">{a.title}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{a.desc}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${impactStyle[a.impact]}`}
                    >
                      {a.impact} impact
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-400/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-200">
                      <AgentIcon className="h-3 w-3" /> {a.agent}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                      <Repeat className="h-3 w-3" /> {a.cadence}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                      <Calendar className="h-3 w-3" /> {a.trigger}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                      <TrendingUp className="h-3 w-3" /> {a.lift}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 md:flex-col md:items-end md:gap-1.5">
                <div className="text-[11px] text-slate-500 md:text-right">{a.nextRun}</div>
                <button
                  onClick={() => toast.success(`Queued "${a.title}" — ${a.agent} scheduled ${a.cadence.toLowerCase()}`)}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-400/20"
                >
                  <PlayCircle className="h-3.5 w-3.5" /> Automate
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      {AUTOMATIONS.length > previewCount && (
        <div className="flex items-center justify-between border-t border-slate-800/70 bg-slate-950/40 px-5 py-3">
          <div className="text-[11px] text-slate-500">
            Showing {items.length} of {AUTOMATIONS.length}
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

function SectionBlock({ section, flashId }: { section: Section; flashId?: string | null }) {
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
          <SuggestionRow key={item.id} item={item} accent={section.accent} tint={section.from} isNew={flashId === item.id} />
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

const AGENT_POOL = [
  "Outreach Agent",
  "Local Agent",
  "Content Strategist",
  "Meta Optimizer",
  "Technical Agent",
  "Blog Writer",
  "GBP Publisher",
  "Review Agent",
];

function SuggestionRow({
  item,
  accent,
  tint,
  isNew,
}: {
  item: Suggestion;
  accent: string;
  tint: string;
  isNew?: boolean;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigned, setAssigned] = useState<string | undefined>(item.assigned);
  const [showModal, setShowModal] = useState(false);

  const impactStyle: Record<Impact, string> = {
    High: "bg-amber-400/10 text-amber-200 border-amber-400/25",
    Medium: "bg-sky-400/10 text-sky-200 border-sky-400/25",
    Low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
  const effortLabel: Record<Effort, string> = { S: "S · Quick", M: "M · Focused", L: "L · Project" };

  const taskAdapter: Task = {
    id: item.id,
    title: item.title,
    desc: item.desc,
    assignee: assigned || "Technical SEO Expert",
    priority: item.impact === "High" ? "high" : item.impact === "Medium" ? "medium" : "low",
    status: "todo",
    createdAt: new Date().toISOString(),
  };

  return (
    <>
      <li className={`group relative flex items-start justify-between gap-4 px-5 py-4 transition hover:bg-slate-900/60 ${isNew ? "bg-cyan-400/5 ring-1 ring-inset ring-cyan-400/30" : ""}`}>
        <div className="flex min-w-0 items-start gap-3 cursor-pointer" onClick={() => setShowModal(true)}>
          <div
            className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${accent} text-slate-950`}
          >
            <Lightbulb className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-white leading-snug group-hover:text-cyan-300 transition">{item.title}</div>
              {isNew && (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-400/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-cyan-100">
                  <Sparkles className="h-2.5 w-2.5" /> New
                </span>
              )}
            </div>
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
              {assigned && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
                  style={{
                    color: tint,
                    background: `color-mix(in oklab, ${tint} 10%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${tint} 22%, transparent)`,
                  }}
                >
                  <Users className="h-3 w-3" /> {assigned}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative mt-1 flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAssignOpen((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              assignOpen || assigned
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
            }`}
          >
            <Users className="h-3 w-3" /> {assigned ? "Reassign" : "Assign"}
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-200 transition hover:bg-cyan-400/20"
          >
            Inspect Items & Approve <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
        {assignOpen && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/95 shadow-xl backdrop-blur">
            <div className="border-b border-slate-800 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">
              Assign to agent
            </div>
            <div className="max-h-64 overflow-y-auto">
              {AGENT_POOL.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setAssigned(a);
                    setAssignOpen(false);
                    toast.success(`Assigned to ${a}`, { description: item.title });
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition ${
                    assigned === a ? "bg-cyan-400/10 text-cyan-100" : "text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  <span className="inline-flex items-center gap-2"><Bot className="h-3 w-3" /> {a}</span>
                  {assigned === a && <span className="text-cyan-300">✓</span>}
                </button>
              ))}
            </div>
            {assigned && (
              <button
                onClick={() => {
                  setAssigned(undefined);
                  setAssignOpen(false);
                  toast(`Unassigned "${item.title}"`);
                }}
                className="w-full border-t border-slate-800 px-3 py-2 text-left text-[11px] text-rose-300 hover:bg-rose-500/10"
              >
                Clear assignment
              </button>
            )}
          </div>
        )}
      </li>

      {showModal && (
        <TaskItemDetailModal
          task={taskAdapter}
          onClose={() => setShowModal(false)}
          onUpdate={(id, patch) => {
            if (patch.assignee) setAssigned(patch.assignee);
            setShowModal(false);
          }}
          onDelete={() => setShowModal(false)}
        />
      )}
    </>
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
