import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  PenSquare,
  ListOrdered,
  ShieldCheck,
  MapPin,
  Play,
  Send,
  UserPlus,
  Copy,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowLeft,
  FileText,
  Wand2,
  Loader2,
  Home,
  Store,
  MapPinned,
  BookOpen,
  Phone,
  DollarSign,
  HelpCircle,
  Info,
  type LucideIcon,
} from "lucide-react";

type Accent = string;

type TabId = "studio" | "writing" | "pipeline" | "quality" | "gmb";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "studio", label: "Content Studio", icon: Sparkles },
  { id: "writing", label: "Content Writing", icon: PenSquare },
  { id: "pipeline", label: "Content Pipeline", icon: ListOrdered },
  { id: "quality", label: "Quality & Audit", icon: ShieldCheck },
  { id: "gmb", label: "GMB Post Writer", icon: MapPin },
];

export function ContentStudioWorkspace({
  accent,
  initialTab = "studio",
}: {
  accent: Accent;
  initialTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? `bg-gradient-to-r ${accent} text-slate-950 shadow`
                  : "border border-slate-800 bg-slate-900/50 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div key={tab} style={{ animation: "fadeInUp .3s ease both" }}>
        {tab === "studio" && <StudioTab accent={accent} />}
        {tab === "writing" && <WritingTab accent={accent} />}
        {tab === "pipeline" && <PipelineTab accent={accent} />}
        {tab === "quality" && <QualityTab accent={accent} />}
        {tab === "gmb" && <GmbTab accent={accent} />}
      </div>
    </div>
  );
}

/* ============================================================ */
/*  1 · Content Studio — one-shot generator + job queue          */
/* ============================================================ */

type Job = {
  id: string;
  keyword: string;
  site: string;
  status: "queued" | "running" | "done" | "failed";
  score?: number;
};

function StudioTab({ accent }: { accent: Accent }) {
  const [keyword, setKeyword] = useState("");
  const [site, setSite] = useState("Safaeewala Cleaning Services LLC — Dubai");
  const [jobs, setJobs] = useState<Job[]>([
    { id: "j1", keyword: "villa deep cleaning palm jumeirah", site: "Safaeewala Cleaning", status: "running" },
    { id: "j2", keyword: "office cleaning JLT", site: "Safaeewala Cleaning", status: "done", score: 94 },
    { id: "j3", keyword: "maid service downtown dubai", site: "Safaeewala Cleaning", status: "queued" },
  ]);

  const submit = () => {
    if (!keyword.trim()) {
      toast.error("Enter a target keyword");
      return;
    }
    const j: Job = {
      id: `j${Date.now()}`,
      keyword: keyword.trim(),
      site: site.split(" — ")[0],
      status: "queued",
    };
    setJobs((prev) => [j, ...prev]);
    setKeyword("");
    toast.success("Content job queued");
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Content Studio"
        blurb="Full AI content pipeline — from keyword to published page. Auto-write SEO-optimized service pages with NLP entity targeting."
        accent={accent}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_260px_auto]">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Target Keyword</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. deep cleaning Dubai"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Site</label>
            <select
              value={site}
              onChange={(e) => setSite(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400/50 focus:outline-none"
            >
              <option>Safaeewala Cleaning Services LLC — Dubai</option>
              <option>Sparkle Maids — Abu Dhabi</option>
              <option>UrbanShine — Sharjah</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={submit}
              className={`inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110`}
            >
              <Wand2 className="h-4 w-4" /> Generate Content
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Content Jobs
          </div>
          <div className="text-[10px] text-slate-500">{jobs.length} jobs</div>
        </div>
        <ul className="divide-y divide-slate-800/80">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3 px-5 py-3">
              <StatusPill status={j.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100">{j.keyword}</div>
                <div className="text-[11px] text-slate-500">{j.site}</div>
              </div>
              {j.score ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">
                  score {j.score}
                </div>
              ) : null}
              <button
                onClick={() => toast("Opening draft…")}
                className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
              >
                View
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  2 · Content Writing — 3-step brief wizard                    */
/* ============================================================ */

const PAGE_TYPES: { id: string; label: string; blurb: string; icon: LucideIcon }[] = [
  { id: "home", label: "Home", blurb: "The front door — promise, proof, paths", icon: Home },
  { id: "service", label: "Service", blurb: "One service, problem → solution → book", icon: Store },
  { id: "area", label: "Area / Location", blurb: "Hyper-local page for a city / neighborhood", icon: MapPinned },
  { id: "blog", label: "Blog (capsule)", blurb: "Question-led, citable, AI-Overview-shaped", icon: BookOpen },
  { id: "about", label: "About", blurb: "E-E-A-T: story, team, credentials", icon: Info },
  { id: "contact", label: "Contact", blurb: "NAP + service area + quote form", icon: Phone },
  { id: "pricing", label: "Pricing", blurb: "Answer-first cost page + drivers", icon: DollarSign },
  { id: "faq", label: "FAQ (as content)", blurb: "On-page Q&A (no FAQ schema)", icon: HelpCircle },
];

function WritingTab({ accent }: { accent: Accent }) {
  const [step, setStep] = useState(0);
  const [siteName] = useState("Safaeewala Cleaning Services LLC — Dubai");
  const [keyword, setKeyword] = useState("villa deep cleaning palm jumeirah");
  const [pageType, setPageType] = useState("service");
  const [loading, setLoading] = useState(false);

  const steps = ["Pick", "Review brief", "Generate"];

  const next = () => {
    if (step === 0 && !keyword.trim()) return toast.error("Target keyword required");
    if (step === 2) return;
    setStep((s) => s + 1);
  };

  const proposeAndGenerate = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(2);
      toast.success("Brief proposed & draft queued");
    }, 900);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="New content (brief)"
        blurb="Propose a grounded, AI-Overview-ready brief, review + edit it, then hand it to the writer. The draft still passes the quality gate before publish."
        accent={accent}
      />

      <Stepper steps={steps} active={step} accent={accent} />

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
        {step === 0 && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Site">
                <select className="input">
                  <option>{siteName}</option>
                </select>
              </Field>
              <Field label="Target keyword">
                <input
                  className="input font-mono"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </Field>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-300">Page type</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {PAGE_TYPES.map((p) => {
                  const Icon = p.icon;
                  const active = pageType === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPageType(p.id)}
                      className={`rounded-lg border p-3 text-left transition ${
                        active
                          ? "border-cyan-400/60 bg-cyan-500/10 ring-1 ring-cyan-400/40"
                          : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Icon className="h-4 w-4 text-cyan-300" />
                        {p.label}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">{p.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <p className="max-w-lg text-[11px] text-slate-500">
                The engine grounds the brief in this site’s real facts (GBP, business facts,
                SEMrush) — it flags missing facts instead of inventing them.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={proposeAndGenerate}
                  disabled={loading}
                  className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
                >
                  Propose + generate now
                </button>
                <button
                  onClick={next}
                  className={`inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-3 py-2 text-xs font-semibold text-slate-950 hover:brightness-110`}
                >
                  Propose brief <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <BriefReview
            accent={accent}
            keyword={keyword}
            pageType={pageType}
            onBack={() => setStep(0)}
            onGenerate={proposeAndGenerate}
            loading={loading}
          />
        )}

        {step === 2 && <GenerateResult accent={accent} keyword={keyword} onRestart={() => setStep(0)} />}
      </div>
    </div>
  );
}

function BriefReview({
  accent,
  keyword,
  pageType,
  onBack,
  onGenerate,
  loading,
}: {
  accent: Accent;
  keyword: string;
  pageType: string;
  onBack: () => void;
  onGenerate: () => void;
  loading: boolean;
}) {
  const outline = useMemo(
    () => [
      `H1 — ${keyword} (Palm Jumeirah)`,
      "H2 — What villa deep cleaning includes in Palm Jumeirah",
      "H2 — How long it takes (4BR / 5BR / 6BR)",
      "H2 — Pricing drivers (AED) and what changes the quote",
      "H2 — Move-in vs post-renovation vs seasonal deep clean",
      "H2 — Booking + service guarantee",
      "FAQ (on-page) — 6 questions",
    ],
    [keyword],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MiniStat label="Page type" value={pageType} />
        <MiniStat label="Word target" value="1,400 – 1,800" />
        <MiniStat label="Entities" value="34" />
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Proposed outline
        </div>
        <ul className="mt-3 space-y-1.5 text-sm text-slate-200">
          {outline.map((h) => (
            <li key={h} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              {h}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-[12px] text-amber-100">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" /> Missing facts detected
        </div>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-amber-100/80">
          <li>GBP hours for Fri/Sat not confirmed</li>
          <li>Trade licence number missing on About page</li>
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          onClick={onGenerate}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-3 py-2 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50`}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Generate draft
        </button>
      </div>
    </div>
  );
}

function GenerateResult({ accent, keyword, onRestart }: { accent: Accent; keyword: string; onRestart: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
          <CheckCircle2 className="h-4 w-4" /> Draft ready
        </div>
        <div className="mt-1 text-[12px] text-emerald-100/80">
          “{keyword}” — 1,612 words · 34 entities · quality score 92
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MiniStat label="Readability" value="Grade 8" />
        <MiniStat label="AI-Overview shape" value="Ready" />
        <MiniStat label="Internal links" value="9" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
        <button className={`inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-3 py-2 text-xs font-semibold text-slate-950 hover:brightness-110`}>
          <FileText className="h-3.5 w-3.5" /> Open in editor
        </button>
        <button
          onClick={() => toast.success("Sent to Quality gate")}
          className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
        >
          Send to Quality
        </button>
        <button
          onClick={onRestart}
          className="ml-auto rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
        >
          Start another
        </button>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  3 · Content Pipeline — kanban of stages                      */
/* ============================================================ */

const PIPELINE_STAGES = [
  { id: "keyword", label: "Keyword", tone: "from-cyan-400 to-sky-500" },
  { id: "brief", label: "Brief", tone: "from-sky-400 to-indigo-500" },
  { id: "draft", label: "Draft", tone: "from-indigo-400 to-violet-500" },
  { id: "qa", label: "Quality", tone: "from-violet-400 to-fuchsia-500" },
  { id: "publish", label: "Publish", tone: "from-emerald-400 to-teal-500" },
] as const;

type PipelineCard = { id: string; title: string; stage: typeof PIPELINE_STAGES[number]["id"]; owner: string; blocked?: string };

const PIPELINE_SEED: PipelineCard[] = [
  { id: "p1", title: "villa deep cleaning palm jumeirah", stage: "draft", owner: "Content Scout" },
  { id: "p2", title: "office cleaning JLT", stage: "qa", owner: "Editorial" },
  { id: "p3", title: "maid service downtown dubai", stage: "brief", owner: "Content Scout" },
  { id: "p4", title: "post-construction cleaning marina", stage: "keyword", owner: "Keyword Scout" },
  { id: "p5", title: "sofa shampooing dubai hills", stage: "publish", owner: "Editorial" },
  { id: "p6", title: "kitchen deep clean JVC", stage: "draft", owner: "Content Scout", blocked: "Awaiting GBP hours" },
  { id: "p7", title: "move-in cleaning Business Bay", stage: "qa", owner: "QA", blocked: "Thin content < 700w" },
];

function PipelineTab({ accent }: { accent: Accent }) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Content Pipeline"
        blurb="Every piece of content in one live view — from keyword pick to publish. Advance cards manually or let the agent auto-progress."
        accent={accent}
      />

      <div className="grid gap-3 md:grid-cols-5">
        {PIPELINE_STAGES.map((s, i) => {
          const cards = PIPELINE_SEED.filter((c) => c.stage === s.id);
          return (
            <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-950/50">
              <div className={`h-1 w-full rounded-t-xl bg-gradient-to-r ${s.tone}`} />
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-800 text-[10px] text-slate-100">
                    {i + 1}
                  </span>
                  {s.label}
                </div>
                <div className="text-[10px] text-slate-500">{cards.length}</div>
              </div>
              <div className="space-y-2 px-2 pb-2">
                {cards.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-800 px-2 py-3 text-center text-[10px] text-slate-600">
                    empty
                  </div>
                )}
                {cards.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-slate-800 bg-slate-900/60 p-2.5 text-[12px] text-slate-200 hover:border-cyan-400/40"
                  >
                    <div className="line-clamp-2">{c.title}</div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{c.owner}</span>
                      <Clock className="h-3 w-3" />
                    </div>
                    {c.blocked && (
                      <div className="mt-1.5 flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                        <AlertTriangle className="h-3 w-3" />
                        {c.blocked}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-[11px] text-slate-400">
        <span>Agent auto-advance is <span className="text-emerald-300">on</span> — cards move when quality gate passes.</span>
        <button
          onClick={() => toast.success("Pipeline refreshed")}
          className={`inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-3 py-1.5 text-[11px] font-semibold text-slate-950 hover:brightness-110`}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  4 · Quality & Audit — merged checker + auditor               */
/* ============================================================ */

function QualityTab({ accent }: { accent: Accent }) {
  const [url, setUrl] = useState("");

  const runAudit = () => {
    if (!url.trim()) return toast.error("Enter a URL to audit");
    toast.success("Queued for audit");
    setUrl("");
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Quality & Audit"
        blurb="One gate for new drafts and existing URLs. E-E-A-T, entity coverage, freshness, decay, and thin-content flags — merged into a single checklist."
        accent={accent}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://safaeewala.com/services/villa-deep-cleaning"
            className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
          <button
            onClick={runAudit}
            className={`inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110`}
          >
            <ShieldCheck className="h-4 w-4" /> Run audit
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MiniStat label="URLs audited" value="312" />
        <MiniStat label="Passing" value="269" tone="emerald" />
        <MiniStat label="Refresh queue" value="28" tone="amber" />
        <MiniStat label="Failed 24h" value="4" tone="rose" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50">
        <div className="border-b border-slate-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-300">
          Latest checks
        </div>
        <ul className="divide-y divide-slate-800/80 text-sm">
          {[
            { url: "/services/villa-deep-cleaning", score: 94, tag: "pass" },
            { url: "/blog/packing-hacks-summer-moves", score: 71, tag: "refresh", note: "keyword decay + old stats" },
            { url: "/services/office-cleaning-jlt", score: 88, tag: "pass" },
            { url: "/areas/dubai-marina", score: 58, tag: "fail", note: "thin content < 400 words" },
          ].map((r) => (
            <li key={r.url} className="flex items-center gap-3 px-5 py-3">
              <ScoreDot score={r.score} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-200">{r.url}</div>
                {r.note && <div className="text-[11px] text-slate-500">{r.note}</div>}
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  r.tag === "pass"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : r.tag === "refresh"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                }`}
              >
                {r.tag}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  5 · GMB Post Writer                                          */
/* ============================================================ */

const GMB_TEMPLATES = [
  { id: "offer", label: "Offer", blurb: "Discount / promo with clear CTA" },
  { id: "update", label: "Update", blurb: "News, hours, coverage areas" },
  { id: "event", label: "Event", blurb: "Date-bound announcement" },
  { id: "product", label: "Service Highlight", blurb: "One service, benefit-led" },
  { id: "howto", label: "How-to Tip", blurb: "Short tip, positions you as expert" },
  { id: "seasonal", label: "Seasonal", blurb: "Ramadan / summer / DSF hooks" },
];

const GMB_KEYWORDS = [
  "villa deep cleaning palm jumeirah",
  "move-in cleaning downtown dubai",
  "office cleaning JLT",
  "post-construction cleaning marina",
  "sofa shampooing dubai hills",
  "ramadan deep cleaning offer",
];

function GmbTab({ accent }: { accent: Accent }) {
  const [keyword, setKeyword] = useState(GMB_KEYWORDS[0]);
  const [templateId, setTemplateId] = useState("offer");
  const [cta, setCta] = useState("Book");
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const generate = () => {
    setLoading(true);
    setTimeout(() => {
      const t = GMB_TEMPLATES.find((x) => x.id === templateId)!;
      const body =
        `${t.label.toUpperCase()} · ${keyword}\n\n` +
        `Safaeewala Cleaning Services keeps homes and offices across Dubai spotless — this week we’re opening extra slots for “${keyword}”.\n\n` +
        `What you get:\n• Trained, background-checked crew\n• Eco-friendly, MOH-approved products\n• Same-day availability across Palm Jumeirah, Marina, Downtown and JLT\n• Fixed AED pricing — no surprises\n\n` +
        `Serving villas, apartments, and offices with a satisfaction guarantee. Tap “${cta}” to lock a slot — most bookings confirmed within 15 minutes.`;
      const clipped = body.slice(0, 1500);
      setDraft(clipped);
      setLoading(false);
      toast.success(`Draft generated · ${clipped.length} chars`);
    }, 700);
  };

  const chars = draft.length;
  const overLimit = chars > 1500;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="GMB Post Writer"
        blurb="Pick a keyword, choose a template, generate a Google Business Profile post under 1,500 characters. Assign to an agent or push to GoHighLevel."
        accent={accent}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* Controls */}
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/50 p-5">
          <Field label="Keyword">
            <select
              className="input"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            >
              {GMB_KEYWORDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Template</div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GMB_TEMPLATES.map((t) => {
                const active = templateId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`rounded-lg border p-2.5 text-left transition ${
                      active
                        ? "border-cyan-400/60 bg-cyan-500/10 ring-1 ring-cyan-400/40"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-xs font-semibold text-white">{t.label}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{t.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Call to action">
            <select className="input" value={cta} onChange={(e) => setCta(e.target.value)}>
              <option>Book</option>
              <option>Call now</option>
              <option>Get quote</option>
              <option>Learn more</option>
              <option>Order online</option>
            </select>
          </Field>

          <button
            onClick={generate}
            disabled={loading}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-3 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50`}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Generate GMB post
          </button>
        </div>

        {/* Draft */}
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Draft
            </div>
            <div
              className={`text-[11px] font-mono ${
                overLimit ? "text-rose-300" : chars > 1300 ? "text-amber-300" : "text-slate-400"
              }`}
            >
              {chars} / 1500
            </div>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1500))}
            placeholder="Your generated GMB post will appear here…"
            rows={12}
            className="w-full resize-none rounded-md border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (!draft) return toast.error("Nothing to copy");
                navigator.clipboard?.writeText(draft);
                toast.success("Copied to clipboard");
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              onClick={() => draft ? toast.success("Assigned to Editorial agent") : toast.error("Generate a draft first")}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"
            >
              <UserPlus className="h-3.5 w-3.5" /> Assign to agent
            </button>
            <button
              onClick={() => draft ? toast.success("Pushed to GoHighLevel") : toast.error("Generate a draft first")}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-3 py-2 text-xs font-semibold text-slate-950 hover:brightness-110`}
            >
              <Send className="h-3.5 w-3.5" /> Send to GoHighLevel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  Shared bits                                                  */
/* ============================================================ */

function SectionHeader({ title, blurb, accent }: { title: string; blurb: string; accent: Accent }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-1 h-6 w-1 rounded-full bg-gradient-to-b ${accent}`} />
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">{blurb}</p>
      </div>
    </div>
  );
}

function Stepper({ steps, active, accent }: { steps: string[]; active: number; accent: Accent }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => {
        const done = i < active;
        const on = i === active;
        return (
          <li key={s} className="flex items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                on
                  ? `bg-gradient-to-r ${accent} text-slate-950`
                  : done
                    ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border border-slate-800 bg-slate-900/50 text-slate-400"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-black/30 text-[10px]">
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              {s}
            </div>
            {i < steps.length - 1 && <div className="h-px w-6 bg-slate-800" />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" | "rose" }) {
  const color =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : tone === "rose"
          ? "text-rose-300"
          : "text-white";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: Job["status"] }) {
  const map = {
    queued: { c: "border-slate-700 bg-slate-800/60 text-slate-300", t: "queued" },
    running: { c: "border-cyan-400/40 bg-cyan-500/10 text-cyan-200", t: "running" },
    done: { c: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200", t: "done" },
    failed: { c: "border-rose-500/30 bg-rose-500/10 text-rose-200", t: "failed" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${map.c}`}>
      {status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
      {map.t}
    </span>
  );
}

function ScoreDot({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-emerald-400" : score >= 70 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="w-7 text-right font-mono text-[11px] text-slate-300">{score}</span>
    </div>
  );
}

/* Tiny input class helper via a shared style */
declare global {
  interface HTMLElementTagNameMap {}
}
