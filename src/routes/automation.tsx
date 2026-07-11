import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Zap,
  Play,
  Pause,
  Plus,
  Search,
  MapPin,
  Star,
  Link2,
  FileText,
  Gauge,
  Bot,
  Globe,
  Building2,
  Bell,
  Calendar,
  Filter,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Mail,
  MessageSquare,
  Languages,
  TrendingUp,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Automation — AKS SEO Console" },
      {
        name: "description",
        content:
          "Automate SEO workflows for a Dubai cleaning company: local SEO, GBP, reviews, backlinks, content, and technical monitoring.",
      },
      { property: "og:title", content: "Automation — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Local SEO automation tailored for Dubai cleaning services: keywords, GBP, reviews, outreach, and site health.",
      },
    ],
  }),
  component: AutomationPage,
});

type Cadence = "realtime" | "hourly" | "daily" | "weekly" | "monthly";
type Status = "running" | "paused" | "draft";

type Flow = {
  id: string;
  name: string;
  desc: string;
  category: string;
  icon: typeof Zap;
  accent: string;
  status: Status;
  cadence: Cadence;
  lastRun: string;
  successRate: number;
};

const CATEGORIES = [
  { id: "local", label: "Local SEO (Dubai)", icon: MapPin, accent: "from-cyan-400 to-sky-500" },
  { id: "gbp", label: "Google Business Profile", icon: Building2, accent: "from-violet-400 to-fuchsia-500" },
  { id: "reviews", label: "Reviews & Reputation", icon: Star, accent: "from-amber-400 to-orange-500" },
  { id: "onpage", label: "On-Page & Content", icon: FileText, accent: "from-emerald-400 to-teal-500" },
  { id: "offpage", label: "Backlinks & Outreach", icon: Link2, accent: "from-rose-400 to-pink-500" },
  { id: "technical", label: "Technical & CWV", icon: Gauge, accent: "from-indigo-400 to-blue-500" },
  { id: "research", label: "Research & Trends", icon: Search, accent: "from-fuchsia-400 to-purple-500" },
  { id: "reporting", label: "Reporting & Alerts", icon: Bell, accent: "from-slate-300 to-slate-500" },
] as const;

const TEMPLATES: Omit<Flow, "id" | "status" | "lastRun" | "successRate">[] = [
  { name: "New Dubai suburb landing page", desc: "Localized service page for a specific Dubai area.", category: "local", icon: MapPin, accent: "from-cyan-400 to-sky-500", cadence: "weekly" },
  { name: "GBP weekly post", desc: "Publish an offer or update to Google Business Profile.", category: "gbp", icon: Building2, accent: "from-violet-400 to-fuchsia-500", cadence: "weekly" },
  { name: "Post-service review request", desc: "WhatsApp + email review request after job completion.", category: "reviews", icon: Star, accent: "from-amber-400 to-orange-500", cadence: "realtime" },
  { name: "Blog brief factory", desc: "Generate SEO briefs for Dubai-intent queries.", category: "onpage", icon: FileText, accent: "from-emerald-400 to-teal-500", cadence: "weekly" },
  { name: "UAE directory submission", desc: "Submit business to top UAE local directories.", category: "offpage", icon: Link2, accent: "from-rose-400 to-pink-500", cadence: "monthly" },
  { name: "Core Web Vitals monitor", desc: "Alert on LCP / CLS regressions.", category: "technical", icon: Gauge, accent: "from-indigo-400 to-blue-500", cadence: "hourly" },
];

const INITIAL_FLOWS: Flow[] = [
  { id: "l1", name: "Dubai suburb landing page generator", desc: "Auto-create localized pages for Marina, JLT, Downtown, Business Bay, Deira, JVC, Al Barsha, Palm Jumeirah, Silicon Oasis.", category: "local", icon: MapPin, accent: "from-cyan-400 to-sky-500", status: "running", cadence: "weekly", lastRun: "2h ago", successRate: 96 },
  { id: "l2", name: "Local schema & NAP sync", desc: "Keep LocalBusiness / CleaningService JSON-LD + NAP consistent across all UAE listings.", category: "local", icon: Globe, accent: "from-cyan-400 to-sky-500", status: "running", cadence: "daily", lastRun: "6h ago", successRate: 99 },
  { id: "l3", name: "Arabic / English localization", desc: "Auto-translate meta, headings and service pages with hreflang ar-AE / en-AE tagging.", category: "local", icon: Languages, accent: "from-cyan-400 to-sky-500", status: "running", cadence: "weekly", lastRun: "1d ago", successRate: 92 },
  { id: "g1", name: "GBP weekly post publisher", desc: "Publish offers, service highlights and photos on Google Business Profile every Monday.", category: "gbp", icon: Building2, accent: "from-violet-400 to-fuchsia-500", status: "running", cadence: "weekly", lastRun: "3d ago", successRate: 100 },
  { id: "g2", name: "GBP Q&A auto-responder", desc: "Detect new questions on GBP and draft responses using service FAQ knowledge base.", category: "gbp", icon: MessageSquare, accent: "from-violet-400 to-fuchsia-500", status: "paused", cadence: "realtime", lastRun: "12h ago", successRate: 88 },
  { id: "g3", name: "Service area & hours sync", desc: "Update service areas across Dubai zones and public UAE holiday hours automatically.", category: "gbp", icon: Calendar, accent: "from-violet-400 to-fuchsia-500", status: "running", cadence: "monthly", lastRun: "12d ago", successRate: 100 },
  { id: "r1", name: "Post-service review request", desc: "Trigger WhatsApp + email review requests 2h after job completion in CRM.", category: "reviews", icon: Star, accent: "from-amber-400 to-orange-500", status: "running", cadence: "realtime", lastRun: "18m ago", successRate: 94 },
  { id: "r2", name: "Review reply drafter", desc: "Draft polite bilingual replies to new Google & Trustpilot reviews; flag < 4★ for human review.", category: "reviews", icon: MessageSquare, accent: "from-amber-400 to-orange-500", status: "running", cadence: "hourly", lastRun: "40m ago", successRate: 97 },
  { id: "r3", name: "Negative-review alert", desc: "Notify manager on Slack + email within 5 min of any 1–3★ review across UAE platforms.", category: "reviews", icon: Bell, accent: "from-amber-400 to-orange-500", status: "running", cadence: "realtime", lastRun: "2h ago", successRate: 100 },
  { id: "c1", name: "Service page meta refresh", desc: "Rewrite outdated meta titles/descriptions for deep-clean, sofa, carpet, move-in/out pages.", category: "onpage", icon: Sparkles, accent: "from-emerald-400 to-teal-500", status: "running", cadence: "weekly", lastRun: "4d ago", successRate: 91 },
  { id: "c2", name: "Blog brief & draft factory", desc: "Generate briefs for Dubai-intent queries (‘maid service DIFC’, ‘villa deep cleaning’) and produce first drafts.", category: "onpage", icon: FileText, accent: "from-emerald-400 to-teal-500", status: "running", cadence: "weekly", lastRun: "1d ago", successRate: 89 },
  { id: "c3", name: "Internal linking bot", desc: "Suggest & apply internal links between service, area and blog pages.", category: "onpage", icon: Link2, accent: "from-emerald-400 to-teal-500", status: "running", cadence: "daily", lastRun: "5h ago", successRate: 95 },
  { id: "b1", name: "UAE directory submission", desc: "Submit business to Yellow Pages UAE, Dubai Chamber, Connect.ae, Yalla, and 20+ local directories.", category: "offpage", icon: Link2, accent: "from-rose-400 to-pink-500", status: "running", cadence: "monthly", lastRun: "9d ago", successRate: 87 },
  { id: "b2", name: "Guest-post outreach", desc: "Prospect UAE lifestyle / real-estate blogs and send personalized pitches.", category: "offpage", icon: Mail, accent: "from-rose-400 to-pink-500", status: "paused", cadence: "weekly", lastRun: "6d ago", successRate: 62 },
  { id: "b3", name: "Broken-link reclamation", desc: "Find UAE sites linking to dead cleaning-service pages and pitch your page as replacement.", category: "offpage", icon: RefreshCw, accent: "from-rose-400 to-pink-500", status: "draft", cadence: "monthly", lastRun: "—", successRate: 0 },
  { id: "t1", name: "Core Web Vitals monitor", desc: "Alert when LCP > 2.5s or CLS > 0.1 on any tracked Dubai service page.", category: "technical", icon: Gauge, accent: "from-indigo-400 to-blue-500", status: "running", cadence: "hourly", lastRun: "22m ago", successRate: 99 },
  { id: "t2", name: "Indexation & crawl audit", desc: "Weekly scan of robots.txt, sitemap, indexation and canonical issues.", category: "technical", icon: ShieldCheck, accent: "from-indigo-400 to-blue-500", status: "running", cadence: "weekly", lastRun: "2d ago", successRate: 98 },
  { id: "t3", name: "Uptime & SSL watcher", desc: "Ping every 5 min from UAE region; alert on downtime or SSL expiry within 30 days.", category: "technical", icon: Bell, accent: "from-indigo-400 to-blue-500", status: "running", cadence: "realtime", lastRun: "3m ago", successRate: 100 },
  { id: "rs1", name: "Dubai keyword miner", desc: "Discover new intent keywords (deep clean, sofa shampoo, holiday-home turnover) with UAE volume.", category: "research", icon: Search, accent: "from-fuchsia-400 to-purple-500", status: "running", cadence: "weekly", lastRun: "3d ago", successRate: 93 },
  { id: "rs2", name: "Competitor SERP tracker", desc: "Track ServiceMarket, Justmop, Matic, Urbanclap positions daily on 200+ UAE queries.", category: "research", icon: TrendingUp, accent: "from-fuchsia-400 to-purple-500", status: "running", cadence: "daily", lastRun: "7h ago", successRate: 100 },
  { id: "rs3", name: "Ramadan / DSF trend watcher", desc: "Surface seasonal query spikes (Ramadan deep clean, DSF villa cleaning) 3 weeks ahead.", category: "research", icon: Sparkles, accent: "from-fuchsia-400 to-purple-500", status: "running", cadence: "weekly", lastRun: "5d ago", successRate: 90 },
  { id: "rp1", name: "Weekly executive report", desc: "Email PDF report every Sunday: rankings, GBP calls, reviews, traffic, top pages.", category: "reporting", icon: Mail, accent: "from-slate-300 to-slate-500", status: "running", cadence: "weekly", lastRun: "6d ago", successRate: 100 },
  { id: "rp2", name: "Rank-drop Slack alert", desc: "Notify #seo channel when tracked keyword drops > 3 positions overnight.", category: "reporting", icon: Bell, accent: "from-slate-300 to-slate-500", status: "running", cadence: "daily", lastRun: "8h ago", successRate: 100 },
];

const CADENCE_LABEL: Record<Cadence, string> = {
  realtime: "Real-time",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

type EditorState =
  | { mode: "create"; base?: Omit<Flow, "id" | "status" | "lastRun" | "successRate"> }
  | { mode: "edit"; flow: Flow }
  | null;

function AutomationPage() {
  const [flows, setFlows] = useState<Flow[]>(INITIAL_FLOWS);
  const [category, setCategory] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Flow | null>(null);

  const filtered = useMemo(() => {
    return flows.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (query && !(`${f.name} ${f.desc}`.toLowerCase().includes(query.toLowerCase()))) return false;
      return true;
    });
  }, [flows, category, statusFilter, query]);

  const kpi = useMemo(() => {
    const running = flows.filter((f) => f.status === "running").length;
    const paused = flows.filter((f) => f.status === "paused").length;
    const draft = flows.filter((f) => f.status === "draft").length;
    const scored = flows.filter((f) => f.successRate > 0);
    const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b.successRate, 0) / scored.length) : 0;
    return { running, paused, draft, avg, total: flows.length };
  }, [flows]);

  function toggleStatus(id: string) {
    setFlows((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: f.status === "running" ? "paused" : "running" } : f,
      ),
    );
  }

  function deleteFlow(id: string) {
    setFlows((prev) => prev.filter((f) => f.id !== id));
    setConfirmDelete(null);
  }

  function saveFlow(data: {
    id?: string;
    name: string;
    desc: string;
    category: string;
    cadence: Cadence;
    status: Status;
  }) {
    const cat = CATEGORIES.find((c) => c.id === data.category) ?? CATEGORIES[0];
    if (data.id) {
      setFlows((prev) =>
        prev.map((f) =>
          f.id === data.id
            ? { ...f, name: data.name, desc: data.desc, category: data.category, cadence: data.cadence, status: data.status, accent: cat.accent }
            : f,
        ),
      );
    } else {
      const newFlow: Flow = {
        id: `n${Date.now()}`,
        name: data.name,
        desc: data.desc,
        category: data.category,
        cadence: data.cadence,
        status: data.status,
        icon: cat.icon,
        accent: cat.accent,
        lastRun: "—",
        successRate: 0,
      };
      setFlows((prev) => [newFlow, ...prev]);
    }
    setEditor(null);
  }

  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/80">
              Dubai · Cleaning Services
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">SEO Automation</h1>
            <p className="mt-1 text-sm text-slate-400">
              Chain agents together with triggers and schedules built for the UAE cleaning market.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTemplatesOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <Bot className="h-4 w-4" /> Templates
            </button>
            <button
              onClick={() => setEditor({ mode: "create" })}
              className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-400/20"
            >
              <Plus className="h-4 w-4" /> New flow
            </button>
          </div>
        </div>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Total flows"
            value={kpi.total}
            sub="Across all categories"
            percent={100}
            ringFrom="#22d3ee"
            ringTo="#0ea5e9"
            icon={Zap}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <KpiCard
            label="Running"
            value={kpi.running}
            sub={`${kpi.total ? Math.round((kpi.running / kpi.total) * 100) : 0}% of pipeline`}
            percent={kpi.total ? (kpi.running / kpi.total) * 100 : 0}
            ringFrom="#34d399"
            ringTo="#14b8a6"
            icon={Play}
            active={statusFilter === "running"}
            onClick={() => setStatusFilter("running")}
          />
          <KpiCard
            label="Paused"
            value={kpi.paused}
            sub={`${kpi.draft} draft`}
            percent={kpi.total ? (kpi.paused / kpi.total) * 100 : 0}
            ringFrom="#fbbf24"
            ringTo="#f97316"
            icon={Pause}
            active={statusFilter === "paused"}
            onClick={() => setStatusFilter("paused")}
          />
          <KpiCard
            label="Avg success"
            value={`${kpi.avg}%`}
            sub="Across scored runs"
            percent={kpi.avg}
            ringFrom="#c084fc"
            ringTo="#e879f9"
            icon={TrendingUp}
          />
        </section>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search automations…"
              className="w-full rounded-md border border-slate-800 bg-slate-950/60 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/50 p-0.5 text-xs">
            {(["all", "running", "paused", "draft"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2.5 py-1 capitalize transition ${
                  statusFilter === s ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Filter className="h-3.5 w-3.5" /> {filtered.length} of {flows.length}
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("all")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
              category === "all"
                ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> All categories
          </button>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                    : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {c.label}
              </button>
            );
          })}
        </div>

        {/* Flow cards */}
        <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => {
            const Icon = f.icon;
            return (
              <li
                key={f.id}
                className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-slate-900/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.08)]"
              >
                <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${f.accent}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${f.accent} text-slate-950 shadow`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white leading-tight">{f.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{f.desc}</div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      f.status === "running"
                        ? "bg-emerald-400/10 text-emerald-300"
                        : f.status === "paused"
                          ? "bg-amber-400/10 text-amber-300"
                          : "bg-slate-700/40 text-slate-400"
                    }`}
                  >
                    {f.status === "running" ? <Play className="h-3 w-3" /> : f.status === "paused" ? <Pause className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                    {f.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
                    <div className="text-slate-500 uppercase tracking-wider">Cadence</div>
                    <div className="mt-0.5 text-slate-200">{CADENCE_LABEL[f.cadence]}</div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
                    <div className="text-slate-500 uppercase tracking-wider">Last run</div>
                    <div className="mt-0.5 text-slate-200">{f.lastRun}</div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5">
                    <div className="text-slate-500 uppercase tracking-wider">Success</div>
                    <div className="mt-0.5 text-slate-200">{f.successRate ? `${f.successRate}%` : "—"}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    {CATEGORIES.find((c) => c.id === f.category)?.label}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleStatus(f.id)}
                      className="rounded-md border border-slate-700 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                      aria-label={f.status === "running" ? "Pause" : "Run"}
                      title={f.status === "running" ? "Pause" : "Run"}
                    >
                      {f.status === "running" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => setEditor({ mode: "edit", flow: f })}
                      className="rounded-md border border-slate-700 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                      aria-label="Edit"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(f)}
                      className="rounded-md border border-rose-500/30 bg-rose-500/5 p-1.5 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
                      aria-label="Delete"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {filtered.length === 0 && (
          <div className="mt-10 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-400">
            No automations match these filters.
          </div>
        )}

        <div aria-hidden className="h-16" />
      </div>

      {/* Editor modal */}
      {editor && (
        <FlowEditor
          state={editor}
          onClose={() => setEditor(null)}
          onSave={saveFlow}
        />
      )}

      {/* Templates modal */}
      {templatesOpen && (
        <TemplatesModal
          onClose={() => setTemplatesOpen(false)}
          onPick={(t) => {
            setTemplatesOpen(false);
            setEditor({ mode: "create", base: t });
          }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} title="Delete automation?">
          <p className="text-sm text-slate-400">
            This will permanently remove <span className="text-slate-200 font-medium">{confirmDelete.name}</span>. This action cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteFlow(confirmDelete.id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function FlowEditor({
  state,
  onClose,
  onSave,
}: {
  state: EditorState;
  onClose: () => void;
  onSave: (data: { id?: string; name: string; desc: string; category: string; cadence: Cadence; status: Status }) => void;
}) {
  if (!state) return null;
  const initial =
    state.mode === "edit"
      ? state.flow
      : {
          id: undefined as string | undefined,
          name: state.base?.name ?? "",
          desc: state.base?.desc ?? "",
          category: state.base?.category ?? CATEGORIES[0].id,
          cadence: state.base?.cadence ?? ("weekly" as Cadence),
          status: "draft" as Status,
        };

  const [name, setName] = useState(initial.name);
  const [desc, setDesc] = useState(initial.desc);
  const [category, setCategory] = useState<string>(initial.category);
  const [cadence, setCadence] = useState<Cadence>(initial.cadence);
  const [status, setStatus] = useState<Status>(initial.status);

  const isEdit = state.mode === "edit";

  return (
    <Modal onClose={onClose} title={isEdit ? "Edit automation" : "New automation"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({
            id: isEdit ? (initial as Flow).id : undefined,
            name: name.trim(),
            desc: desc.trim(),
            category,
            cadence,
            status,
          });
        }}
        className="space-y-3"
      >
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dubai Marina landing pages"
            className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="What does this automation do?"
            className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Cadence">
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as Cadence)}
              className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
                <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="w-full rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              <option value="running">Running</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
            </select>
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/25"
          >
            {isEdit ? "Save changes" : "Create flow"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function TemplatesModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (t: (typeof TEMPLATES)[number]) => void;
}) {
  return (
    <Modal onClose={onClose} title="Start from a template">
      <p className="text-xs text-slate-400">Pick a starting point tuned for a Dubai cleaning business.</p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.name}>
              <button
                onClick={() => onPick(t)}
                className="group flex w-full items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-left transition hover:border-cyan-400/40 hover:bg-slate-900"
              >
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-to-br ${t.accent} text-slate-950`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white leading-tight">{t.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{t.desc}</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function KpiCard({
  label,
  value,
  sub,
  percent,
  ringFrom,
  ringTo,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  percent: number;
  ringFrom: string;
  ringTo: string;
  icon: typeof Zap;
  active?: boolean;
  onClick?: () => void;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  const size = 56;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const gradId = `kpi-${label.replace(/\s+/g, "-")}`;
  const clickable = !!onClick;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all ${
        active
          ? "border-cyan-400/50 bg-slate-900/70 shadow-[0_0_25px_rgba(34,211,238,0.12)]"
          : "border-slate-800 bg-slate-900/40"
      } ${clickable ? "cursor-pointer hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900/70" : "cursor-default"}`}
    >
      <div
        aria-hidden
        className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20"
        style={{ background: `radial-gradient(circle, ${ringFrom}, transparent 70%)` }}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
            <Icon className="h-3 w-3" style={{ color: ringFrom }} />
            {label}
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
                <stop offset="0%" stopColor={ringFrom} />
                <stop offset="100%" stopColor={ringTo} />
              </linearGradient>
            </defs>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="rgb(30 41 59)"
              strokeWidth={stroke}
              fill="none"
            />
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
    </button>
  );
}
