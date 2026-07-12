import { useMemo, useState } from "react";
import {
  Lightbulb,
  Tags,
  ListOrdered,
  ImageIcon,
  Sparkles,
  CheckCircle2,
  Save,
  ArrowLeft,
  ArrowRight,
  Upload,
  X,
  Plus,
  FileCheck2,
  Loader2,
  Globe,
  Clock,
  Type,
  Database,
  Download,
  Network,
  BookOpen,
  Languages,
  ShieldCheck,
  AlertTriangle,
  FileSearch,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

type Accent = string;

type WizardStep = {
  id: string;
  label: string;
  short: string;
  icon: LucideIcon;
  description: string;
};

const STEPS: WizardStep[] = [
  {
    id: "topic",
    label: "Topic Selection",
    short: "Topic",
    icon: Lightbulb,
    description:
      "Pick the working title, audience, and angle for this post. Everything downstream builds on this.",
  },
  {
    id: "keywords",
    label: "Keyword & Entity Selection",
    short: "Keywords",
    icon: Tags,
    description:
      "Add primary and supporting keywords plus the entities you want covered in the copy.",
  },
  {
    id: "outline",
    label: "Outline Generation",
    short: "Outline",
    icon: ListOrdered,
    description:
      "Generate and refine an H2/H3 skeleton. Drag to reorder, remove or add sections.",
  },
  {
    id: "media",
    label: "Media / Image Attachment",
    short: "Media",
    icon: ImageIcon,
    description:
      "Attach the hero, in-body visuals, and alt text. Files stay in the draft until you publish.",
  },
  {
    id: "generate",
    label: "Content Generation",
    short: "Generate",
    icon: Sparkles,
    description:
      "Choose tone, length, and reading level, then let the scout draft the full article.",
  },
  {
    id: "audit",
    label: "Content Audit",
    short: "Audit",
    icon: FileSearch,
    description:
      "Review the draft against SEO, brand, readability, and originality checks before publish.",
  },
  {
    id: "review",
    label: "Review & Publish",
    short: "Publish",
    icon: CheckCircle2,
    description:
      "Preview the final draft, run last-mile checks, and schedule or publish.",
  },
];

type WizardState = {
  topic: string;
  audience: string;
  angle: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  entities: string[];
  outline: { id: string; heading: string; type: "H2" | "H3" }[];
  media: { id: string; name: string; alt: string }[];
  tone: string;
  length: string;
  reading: string;
  cta: string;
  slug: string;
  meta: string;
  scheduleAt: string;
};

const initialState: WizardState = {
  topic: "Office Relocation Checklist for Dubai SMEs",
  audience: "Operations managers of 20-100 person UAE offices",
  angle: "A practical, timeline-based guide with a downloadable checklist.",
  primaryKeyword: "office relocation dubai",
  secondaryKeywords: [
    "office movers uae",
    "commercial move checklist",
    "corporate relocation dubai",
  ],
  entities: ["JAFZA", "DMCC", "Ejari", "DEWA", "Etisalat"],
  outline: [
    { id: "o1", heading: "Why office relocation in Dubai is different", type: "H2" },
    { id: "o2", heading: "8–12 weeks before move-day", type: "H2" },
    { id: "o3", heading: "Landlord & Ejari checklist", type: "H3" },
    { id: "o4", heading: "IT & connectivity handover", type: "H3" },
    { id: "o5", heading: "Move week: who owns what", type: "H2" },
    { id: "o6", heading: "First 30 days in the new office", type: "H2" },
  ],
  media: [
    { id: "m1", name: "hero-office-move.jpg", alt: "Movers loading office furniture into a truck outside a Dubai tower" },
  ],
  tone: "Confident & practical",
  length: "Long-form (1,600–2,000 words)",
  reading: "Grade 8",
  cta: "Book a free relocation call",
  slug: "office-relocation-checklist-dubai",
  meta: "A week-by-week Dubai office relocation checklist for SMEs — landlord, IT, movers, and settle-in steps.",
  scheduleAt: "",
};

export function BlogWriterWizard({ accent }: { accent: Accent }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<WizardState>(initialState);
  const [saved, setSaved] = useState<string>("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);

  const step = STEPS[stepIdx];
  const StepIcon = step.icon;
  const progress = useMemo(
    () => ((stepIdx + 1) / STEPS.length) * 100,
    [stepIdx],
  );

  const patch = (p: Partial<WizardState>) =>
    setState((s) => ({ ...s, ...p }));

  const saveDraft = () => {
    setSaved(
      new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
  };

  const next = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const prev = () => setStepIdx((i) => Math.max(i - 1, 0));

  const publish = () => {
    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      setPublished(true);
    }, 1200);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      {/* Header + progress */}
      <div className="border-b border-slate-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">
              Wizard
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${accent}`}>
                <StepIcon className="h-4 w-4 text-slate-950" />
              </span>
              <h2 className="text-lg font-semibold text-white">
                Blog Writer · {step.label}
              </h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              {step.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-300">
              <Clock className="h-3.5 w-3.5 text-cyan-300" />
              Step {stepIdx + 1} of {STEPS.length}
            </span>
            {saved ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">
                <FileCheck2 className="h-3.5 w-3.5" />
                Draft saved {saved}
              </span>
            ) : null}
          </div>
        </div>

        {/* Progress rail */}
        <div className="mt-6">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`absolute inset-y-0 left-0 bg-gradient-to-r ${accent} transition-all duration-500`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === stepIdx;
              const isDone = i < stepIdx;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setStepIdx(i)}
                    className={`group relative flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                      isActive
                        ? "border-cyan-400/50 bg-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
                        : isDone
                          ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                          : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                    }`}
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-semibold ${
                        isActive
                          ? `bg-gradient-to-br ${accent} text-slate-950`
                          : isDone
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Step {i + 1}
                      </div>
                      <div
                        className={`truncate text-xs font-semibold ${
                          isActive ? "text-white" : isDone ? "text-emerald-100" : "text-slate-300"
                        }`}
                      >
                        {s.short}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Step body */}
      <div key={step.id} className="p-5" style={{ animation: "fadeInUp .35s ease both" }}>
        {step.id === "topic" && (
          <TopicStep state={state} patch={patch} accent={accent} />
        )}
        {step.id === "keywords" && (
          <KeywordsStep state={state} patch={patch} accent={accent} />
        )}
        {step.id === "outline" && (
          <OutlineStep state={state} patch={patch} accent={accent} />
        )}
        {step.id === "media" && (
          <MediaStep state={state} patch={patch} accent={accent} />
        )}
        {step.id === "generate" && (
          <GenerateStep state={state} patch={patch} accent={accent} />
        )}
        {step.id === "audit" && (
          <AuditStep state={state} patch={patch} accent={accent} />
        )}
        {step.id === "review" && (
          <ReviewStep
            state={state}
            patch={patch}
            accent={accent}
            publishing={publishing}
            published={published}
            onPublish={publish}
          />
        )}
      </div>

      {/* Sticky action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/60 p-4">
        <button
          onClick={prev}
          disabled={stepIdx === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={saveDraft}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/20"
          >
            <Save className="h-4 w-4" /> Save Draft
          </button>
          {stepIdx < STEPS.length - 1 ? (
            <button
              onClick={next}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${accent} px-3.5 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-110`}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={publish}
              disabled={publishing || published}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${accent} px-3.5 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-110 disabled:opacity-60`}
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
                </>
              ) : published ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Published
                </>
              ) : (
                <>
                  <Globe className="h-4 w-4" /> Publish now
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Reusable primitives ---------------- */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {hint ? <span className="text-[10px] text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20";

function ChipInput({
  values,
  onChange,
  placeholder,
  accent,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  accent: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className={`inline-flex items-center gap-1 rounded-full border border-slate-700 bg-gradient-to-r ${accent} bg-opacity-10 px-2 py-0.5 text-[11px] text-slate-100`}
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              className="rounded-full p-0.5 text-slate-300/80 hover:bg-slate-950/60 hover:text-white"
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="min-w-[160px] flex-1 bg-transparent px-2 py-1 text-sm text-slate-100 placeholder:text-slate-600 outline-none"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}

/* ---------------- Step bodies ---------------- */

type StepProps = {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  accent: string;
};

function TopicStep({ state, patch }: StepProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Field label="Working title" hint={`${state.topic.length}/80`}>
          <input
            className={inputCls}
            maxLength={80}
            value={state.topic}
            onChange={(e) => patch({ topic: e.target.value })}
            placeholder="e.g. Office Relocation Checklist for Dubai SMEs"
          />
        </Field>
        <Field label="Primary audience">
          <input
            className={inputCls}
            value={state.audience}
            onChange={(e) => patch({ audience: e.target.value })}
            placeholder="Who is this for?"
          />
        </Field>
        <Field label="Angle / hook">
          <textarea
            className={`${inputCls} min-h-[92px] resize-y`}
            value={state.angle}
            onChange={(e) => patch({ angle: e.target.value })}
            placeholder="What point of view sets this post apart?"
          />
        </Field>
      </div>
      <aside className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">
          Suggested from Keyword Scout
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {[
            "office movers dubai",
            "villa move checklist",
            "corporate relocation UAE",
            "packing hacks summer moves",
          ].map((t) => (
            <li key={t}>
              <button
                onClick={() => patch({ topic: t })}
                className="w-full rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-left text-slate-200 hover:border-cyan-400/40 hover:text-cyan-100"
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function KeywordsStep({ state, patch, accent }: StepProps) {
  const [listOpen, setListOpen] = useState(false);
  const KEYWORD_LISTS = [
    { name: "EN · Movers & Storage", kws: ["office movers dubai", "villa relocation UAE", "packing services marina"] },
    { name: "Local · Marina + JLT", kws: ["marina movers", "jlt storage", "cluster q movers"] },
    { name: "Competitor Gaps", kws: ["cheap movers dubai", "same day storage", "office packing service"] },
    { name: "AR · نقل الاثاث دبي", kws: ["نقل اثاث دبي", "شركة نقل عفش دبي", "نقل مكاتب دبي"] },
  ];
  const SUGGESTED_ENTITIES = ["JAFZA", "DMCC", "Ejari", "DEWA", "Etisalat", "Business Bay", "Dubai Marina", "Downtown Dubai"];
  const RELEVANT = ["moving company dubai", "packing tips uae", "storage solutions dubai", "commercial relocation", "office fit-out"];
  const SEMANTIC = ["relocation", "logistics", "packing crate", "inventory", "insurance", "warehouse", "load-out", "furniture assembly"];

  const importFromList = (list: (typeof KEYWORD_LISTS)[number]) => {
    const [primary, ...rest] = list.kws;
    patch({
      primaryKeyword: primary,
      secondaryKeywords: Array.from(new Set([...state.secondaryKeywords, ...rest])),
    });
    setListOpen(false);
  };
  const addChip = (field: "secondaryKeywords" | "entities", v: string) => {
    const cur = state[field];
    if (cur.includes(v)) return;
    patch({ [field]: [...cur, v] } as Partial<WizardState>);
  };

  return (
    <div className="space-y-4">
      {/* Fetch bar */}
      <div className={`relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-4`}>
        <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">Sources</div>
            <div className="text-sm font-semibold text-white">Pull keywords into this brief</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setListOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${accent} px-3 py-1.5 text-xs font-semibold text-slate-950 shadow hover:brightness-110`}
              >
                <Database className="h-3.5 w-3.5" /> Fetch from Keyword List
              </button>
              {listOpen && (
                <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/95 shadow-xl backdrop-blur">
                  <div className="border-b border-slate-800 px-3 py-2 text-[10px] uppercase tracking-wider text-cyan-300/70">
                    Choose a list
                  </div>
                  <ul className="max-h-72 overflow-auto py-1">
                    {KEYWORD_LISTS.map((l) => (
                      <li key={l.name}>
                        <button
                          onClick={() => importFromList(l)}
                          className="block w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-900"
                        >
                          <div className="font-semibold text-white">{l.name}</div>
                          <div className="text-[10px] text-slate-500">{l.kws.length} keywords</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20">
              <ExternalLink className="h-3.5 w-3.5" /> Semrush lookup
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200">
              <Download className="h-3.5 w-3.5" /> Import CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Primary keyword">
            <input
              className={inputCls}
              value={state.primaryKeyword}
              onChange={(e) => patch({ primaryKeyword: e.target.value })}
              placeholder="One clear head term"
            />
          </Field>
          <Field label="Secondary keywords" hint="Enter to add">
            <ChipInput
              values={state.secondaryKeywords}
              onChange={(v) => patch({ secondaryKeywords: v })}
              placeholder="Add a supporting keyword"
              accent={accent}
            />
          </Field>
          <Field label="Entities to cover" hint="People, places, brands">
            <ChipInput
              values={state.entities}
              onChange={(v) => patch({ entities: v })}
              placeholder="Add an entity"
              accent={accent}
            />
          </Field>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">
              Coverage
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3 text-center">
              <StatMini label="Primary" value="1" />
              <StatMini label="Secondary" value={String(state.secondaryKeywords.length)} />
              <StatMini label="Entities" value={String(state.entities.length)} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <SuggestBox
            title="Suggested Entities"
            icon={BookOpen}
            accent={accent}
            items={SUGGESTED_ENTITIES}
            onAdd={(v) => addChip("entities", v)}
          />
          <SuggestBox
            title="Suggested Relevant Keywords"
            icon={Network}
            accent={accent}
            items={RELEVANT}
            onAdd={(v) => addChip("secondaryKeywords", v)}
          />
          <SuggestBox
            title="Semantic Keywords"
            icon={Languages}
            accent={accent}
            items={SEMANTIC}
            onAdd={(v) => addChip("secondaryKeywords", v)}
          />
        </div>
      </div>
    </div>
  );
}

function SuggestBox({
  title,
  icon: Icon,
  items,
  onAdd,
  accent,
}: {
  title: string;
  icon: LucideIcon;
  items: string[];
  onAdd: (v: string) => void;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cyan-300/70">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((v) => (
          <button
            key={v}
            onClick={() => onAdd(v)}
            className="group inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/50 px-2 py-0.5 text-[11px] text-slate-200 hover:border-cyan-400/40 hover:text-cyan-100"
          >
            <Plus className="h-3 w-3 text-slate-500 group-hover:text-cyan-300" />
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function OutlineStep({ state, patch, accent }: StepProps) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= state.outline.length) return;
    const next = [...state.outline];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ outline: next });
  };
  const remove = (id: string) =>
    patch({ outline: state.outline.filter((o) => o.id !== id) });
  const addH2 = () =>
    patch({
      outline: [
        ...state.outline,
        {
          id: `o${Date.now()}`,
          heading: "New section",
          type: "H2",
        },
      ],
    });
  const setHeading = (id: string, heading: string) =>
    patch({
      outline: state.outline.map((o) => (o.id === id ? { ...o, heading } : o)),
    });
  const setType = (id: string, type: "H2" | "H3") =>
    patch({
      outline: state.outline.map((o) => (o.id === id ? { ...o, type } : o)),
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
      <ol className="space-y-2">
        {state.outline.map((o, i) => (
          <li
            key={o.id}
            className="group flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2"
          >
            <div className="flex flex-col">
              <button
                onClick={() => move(i, -1)}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                aria-label="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => move(i, 1)}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                aria-label="Move down"
              >
                ▼
              </button>
            </div>
            <select
              value={o.type}
              onChange={(e) => setType(o.id, e.target.value as "H2" | "H3")}
              className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 text-[11px] font-semibold text-slate-200"
            >
              <option value="H2">H2</option>
              <option value="H3">H3</option>
            </select>
            <input
              value={o.heading}
              onChange={(e) => setHeading(o.id, e.target.value)}
              className="flex-1 bg-transparent px-1 py-1 text-sm text-slate-100 outline-none"
            />
            <button
              onClick={() => remove(o.id)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
              aria-label="Remove section"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
        <li>
          <button
            onClick={addH2}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
          >
            <Plus className="h-3.5 w-3.5" /> Add section
          </button>
        </li>
      </ol>
      <aside className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">
          Auto-outline
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Regenerate based on your topic, primary keyword and top-ranking SERP.
        </p>
        <button
          className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r ${accent} px-3 py-2 text-xs font-semibold text-slate-950 hover:brightness-110`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Regenerate outline
        </button>
      </aside>
    </div>
  );
}

function MediaStep({ state, patch }: StepProps) {
  const add = () =>
    patch({
      media: [
        ...state.media,
        {
          id: `m${Date.now()}`,
          name: `image-${state.media.length + 1}.jpg`,
          alt: "",
        },
      ],
    });
  const remove = (id: string) =>
    patch({ media: state.media.filter((m) => m.id !== id) });
  const setAlt = (id: string, alt: string) =>
    patch({ media: state.media.map((m) => (m.id === id ? { ...m, alt } : m)) });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {state.media.map((m) => (
          <div
            key={m.id}
            className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60"
          >
            <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
              <ImageIcon className="h-8 w-8 text-slate-500" />
              <button
                onClick={() => remove(m.id)}
                className="absolute right-2 top-2 rounded-md bg-slate-950/70 p-1 text-slate-300 hover:text-rose-300"
                aria-label="Remove media"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 p-3">
              <div className="truncate text-xs font-medium text-slate-200">
                {m.name}
              </div>
              <input
                value={m.alt}
                onChange={(e) => setAlt(m.id, e.target.value)}
                placeholder="Alt text (required for accessibility)"
                className={`${inputCls} py-1.5 text-xs`}
              />
            </div>
          </div>
        ))}
        <button
          onClick={add}
          className="flex h-full min-h-[176px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-4 text-slate-400 hover:border-cyan-400/50 hover:text-cyan-200"
        >
          <Upload className="h-6 w-6" />
          <div className="text-xs font-medium">Upload image</div>
          <div className="text-[10px] text-slate-500">PNG, JPG up to 5 MB</div>
        </button>
      </div>
    </div>
  );
}

function GenerateStep({ state, patch, accent }: StepProps) {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const generate = () => {
    setGenerating(true);
    setGenerated(false);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 1200);
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tone">
            <select
              className={inputCls}
              value={state.tone}
              onChange={(e) => patch({ tone: e.target.value })}
            >
              <option>Confident & practical</option>
              <option>Warm & conversational</option>
              <option>Editorial & authoritative</option>
              <option>Playful & punchy</option>
            </select>
          </Field>
          <Field label="Length">
            <select
              className={inputCls}
              value={state.length}
              onChange={(e) => patch({ length: e.target.value })}
            >
              <option>Short (600–900 words)</option>
              <option>Standard (1,000–1,400 words)</option>
              <option>Long-form (1,600–2,000 words)</option>
              <option>Pillar (2,500+ words)</option>
            </select>
          </Field>
          <Field label="Reading level">
            <select
              className={inputCls}
              value={state.reading}
              onChange={(e) => patch({ reading: e.target.value })}
            >
              <option>Grade 6</option>
              <option>Grade 8</option>
              <option>Grade 10</option>
              <option>Expert</option>
            </select>
          </Field>
        </div>
        <Field label="Call to action">
          <input
            className={inputCls}
            value={state.cta}
            onChange={(e) => patch({ cta: e.target.value })}
            placeholder="What should the reader do next?"
          />
        </Field>
        <button
          onClick={generate}
          disabled={generating}
          className={`inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${accent} px-3.5 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-110 disabled:opacity-60`}
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Drafting…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> {generated ? "Regenerate draft" : "Generate draft"}
            </>
          )}
        </button>
      </div>
      <aside className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">
          Draft preview
        </div>
        {generated ? (
          <div className="mt-2 space-y-2 text-xs text-slate-300">
            <p className="font-semibold text-white">{state.topic}</p>
            <p className="text-slate-400">
              Relocating a Dubai office is part logistics, part regulation. This guide walks {state.audience.toLowerCase()} through every step — from Ejari paperwork to DEWA transfers — so you land in the new space on day one, not day thirty.
            </p>
            <p className="text-slate-500">
              …{state.outline.length} sections drafted · {state.length.toLowerCase()}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Draft appears here after generation.
          </p>
        )}
      </aside>
    </div>
  );
}

function ReviewStep({
  state,
  patch,
  accent,
  publishing,
  published,
  onPublish,
}: StepProps & {
  publishing: boolean;
  published: boolean;
  onPublish: () => void;
}) {
  const checks = [
    { ok: state.topic.length > 10, label: "Working title set" },
    { ok: state.primaryKeyword.length > 2, label: "Primary keyword present" },
    { ok: state.outline.length >= 3, label: "Outline has 3+ sections" },
    { ok: state.media.every((m) => m.alt.length > 0), label: "All media has alt text" },
    { ok: state.meta.length > 50, label: "Meta description ≥ 50 chars" },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-950/60 p-5">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-cyan-300" />
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Post preview
          </div>
        </div>
        <h3 className="mt-2 text-2xl font-semibold text-white">{state.topic}</h3>
        <div className="mt-1 text-[11px] text-slate-500">
          /{state.slug} · targeting <span className="text-cyan-300">{state.primaryKeyword}</span>
        </div>
        <p className="mt-4 text-sm text-slate-300">
          {state.angle}
        </p>
        <div className="mt-4 space-y-1.5">
          {state.outline.map((o) => (
            <div
              key={o.id}
              className={`flex items-center gap-2 text-sm ${
                o.type === "H2" ? "text-slate-100" : "pl-4 text-slate-400"
              }`}
            >
              <span className="text-[10px] font-mono text-slate-500">{o.type}</span>
              {o.heading}
            </div>
          ))}
        </div>
      </div>
      <aside className="space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">
            Pre-publish checks
          </div>
          <ul className="mt-3 space-y-2">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                    c.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                  }`}
                >
                  {c.ok ? "✓" : "!"}
                </span>
                <span className={c.ok ? "text-slate-200" : "text-rose-200"}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <Field label="URL slug">
            <input
              className={inputCls}
              value={state.slug}
              onChange={(e) => patch({ slug: e.target.value })}
            />
          </Field>
          <Field label="Meta description" hint={`${state.meta.length}/160`}>
            <textarea
              maxLength={160}
              value={state.meta}
              onChange={(e) => patch({ meta: e.target.value })}
              className={`${inputCls} min-h-[72px] resize-y`}
            />
          </Field>
          <Field label="Schedule (optional)">
            <input
              type="datetime-local"
              value={state.scheduleAt}
              onChange={(e) => patch({ scheduleAt: e.target.value })}
              className={inputCls}
            />
          </Field>
          <button
            onClick={onPublish}
            disabled={publishing || published}
            className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r ${accent} px-3.5 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-110 disabled:opacity-60`}
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
              </>
            ) : published ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Published
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" /> {state.scheduleAt ? "Schedule" : "Publish now"}
              </>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Audit Step ---------------- */

function AuditStep({ state, accent }: StepProps) {
  const wordCount = state.outline.length * 220 + 480;
  const audits = [
    { group: "SEO", icon: ShieldCheck, items: [
      { ok: state.primaryKeyword.length > 2, label: `Primary keyword present (${state.primaryKeyword || "—"})` },
      { ok: state.secondaryKeywords.length >= 3, label: `≥ 3 secondary keywords (${state.secondaryKeywords.length})` },
      { ok: state.entities.length >= 3, label: `Named entities covered (${state.entities.length})` },
      { ok: state.meta.length >= 50 && state.meta.length <= 160, label: `Meta description length OK (${state.meta.length})` },
    ]},
    { group: "Structure", icon: ListOrdered, items: [
      { ok: state.outline.length >= 4, label: `Outline has 4+ sections (${state.outline.length})` },
      { ok: state.outline.some((o) => o.type === "H3"), label: "At least one H3 sub-section" },
      { ok: state.media.every((m) => m.alt.length > 0), label: "All media has alt text" },
    ]},
    { group: "Quality", icon: FileSearch, items: [
      { ok: wordCount >= 1000, label: `Estimated word count ≥ 1000 (${wordCount})` },
      { ok: state.cta.length > 4, label: "Clear call-to-action" },
      { ok: state.topic.length <= 70, label: `Title within 70 chars (${state.topic.length})` },
    ]},
  ];
  const scores = audits.map((g) => ({
    group: g.group,
    icon: g.icon,
    pct: Math.round((g.items.filter((i) => i.ok).length / g.items.length) * 100),
  }));
  const overall = Math.round(scores.reduce((a, s) => a + s.pct, 0) / scores.length);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <div className={`relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-5`}>
          <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent}`} />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/70">Overall audit score</div>
              <div className="mt-1 text-3xl font-semibold text-white">{overall}<span className="text-base text-slate-500">/100</span></div>
            </div>
            <div className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${accent} text-slate-950 shadow`}>
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full bg-gradient-to-r ${accent}`} style={{ width: `${overall}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {scores.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.group} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                    <Icon className="h-3.5 w-3.5 text-cyan-300" /> {s.group}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-white">{s.pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {audits.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.group} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center gap-2">
                <span className={`grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br ${accent}`}>
                  <Icon className="h-3.5 w-3.5 text-slate-950" />
                </span>
                <div className="text-sm font-semibold text-white">{g.group}</div>
              </div>
              <ul className="mt-3 space-y-2">
                {g.items.map((i) => (
                  <li key={i.label} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${i.ok ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                      {i.ok ? "✓" : "!"}
                    </span>
                    <span className={i.ok ? "text-slate-200" : "text-rose-200"}>{i.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <aside className="space-y-3">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-200/90">
            <AlertTriangle className="h-3.5 w-3.5" /> Reviewer notes
          </div>
          <ul className="mt-2 space-y-2 text-xs text-slate-300">
            <li>· Tighten intro — remove filler in the first two sentences.</li>
            <li>· Add one internal link to /services/office-relocation.</li>
            <li>· Cite Ejari and DEWA transfer flows with source links.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">Originality</div>
          <div className="mt-2 text-2xl font-semibold text-white">97%<span className="text-sm text-slate-500"> unique</span></div>
          <div className="mt-1 text-[11px] text-slate-500">3 matched fragments across the web · none flagged as risky.</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="text-[10px] uppercase tracking-wider text-cyan-300/70">Readability</div>
          <div className="mt-2 text-2xl font-semibold text-white">{state.reading}</div>
          <div className="mt-1 text-[11px] text-slate-500">Target audience: {state.audience}</div>
        </div>
        <button className={`w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r ${accent} px-3.5 py-2 text-xs font-semibold text-slate-950 shadow hover:brightness-110`}>
          <Sparkles className="h-4 w-4" /> Re-run full audit
        </button>
      </aside>
    </div>
  );
}
