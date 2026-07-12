import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Hammer,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  FileText,
  Globe2,
  Palette,
  Map as MapIcon,
  Layers,
  ShieldCheck,
  Upload,
  Radar,
  CheckCircle2,
  Circle,
  Loader2,
  Activity,
  Clock,
  Server,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/build-agent")({
  head: () => ({
    meta: [
      { title: "Build Agent — AKS SEO Console" },
      { name: "description", content: "End-to-end AI website builder: research → design → deploy → QA." },
    ],
  }),
  component: BuildAgentPage,
});

type View = "dashboard" | "new" | "running";

type Phase = {
  id: string;
  title: string;
  icon: typeof FileText;
  blurb: string;
  duration: number; // seconds simulated
};

const PHASES: Phase[] = [
  { id: "brief", title: "Brief", icon: FileText, blurb: "Business, city, services, content source, design direction.", duration: 4 },
  { id: "research", title: "Global research", icon: Globe2, blurb: "Agent surveys 10+ top-performing sites in your niche worldwide.", duration: 10 },
  { id: "design", title: "Design DNA", icon: Palette, blurb: "Unique palette, typography, voice. Distinct from local competitors.", duration: 8 },
  { id: "sitemap", title: "Sitemap", icon: MapIcon, blurb: "Home · service pages · service-area pages · trust pages · blog seed.", duration: 6 },
  { id: "pages", title: "Pages", icon: Layers, blurb: "Each page generated with schema + AI-Overview-ready content.", duration: 12 },
  { id: "qa", title: "Quality review", icon: ShieldCheck, blurb: "Scored for AI Overview readiness, technical SEO, and conventions.", duration: 6 },
  { id: "deploy", title: "Deploy", icon: Upload, blurb: "Pushes to your Hostinger WordPress via the GYL Suite plugin.", duration: 6 },
  { id: "post", title: "Post-publish QA", icon: Radar, blurb: "Playwright tests every page across mobile, tablet, and wide viewports.", duration: 5 },
];

function BuildAgentPage() {
  const [view, setView] = useState<View>("dashboard");
  return (
    <div className="min-h-screen bg-[#05070d] text-slate-200">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/40">
            <Hammer className="h-5 w-5 text-cyan-200" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white">Build Agent</h1>
            <p className="text-sm text-slate-400">End-to-end AI website factory · research → design → deploy → QA.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {view !== "dashboard" && (
              <button onClick={() => setView("dashboard")} className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300 hover:border-cyan-400/40">
                <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
              </button>
            )}
            {view === "dashboard" && (
              <button onClick={() => setView("new")} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300">
                <Sparkles className="h-3.5 w-3.5" /> Build new site
              </button>
            )}
          </div>
        </header>

        {view === "dashboard" && <Dashboard onNew={() => setView("new")} onOpen={() => setView("running")} />}
        {view === "new" && <NewSiteForm onStart={() => setView("running")} />}
        {view === "running" && <BuildProgress />}
      </div>
    </div>
  );
}

/* ────────────────────────────── Dashboard ─────────────────────────────── */

function Dashboard({ onNew, onOpen }: { onNew: () => void; onOpen: () => void }) {
  const stats = [
    { l: "Sites built", v: "27", i: Rocket, tone: "text-cyan-300" },
    { l: "In progress", v: "3", i: Loader2, tone: "text-amber-300" },
    { l: "Avg build time", v: "2h 14m", i: Clock, tone: "text-emerald-300" },
    { l: "Worker uptime", v: "99.98%", i: Server, tone: "text-violet-300" },
  ];

  const jobs = [
    { name: "spotlesscleaningservices", domain: "safaeewala.com", phase: "Global research", pct: 12, tone: "amber" },
    { name: "brightsmiledental", domain: "brightsmiledental.com", phase: "Design DNA", pct: 38, tone: "cyan" },
    { name: "peakfitnessuae", domain: "peakfitness.ae", phase: "Pages", pct: 71, tone: "emerald" },
  ];

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">{s.l}</span>
              <s.i className={`h-4 w-4 ${s.tone}`} />
            </div>
            <div className="mt-1.5 text-2xl font-semibold text-white">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-950 to-blue-950/40 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
            <Rocket className="h-6 w-6 text-slate-950" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">Build a new website</div>
            <h2 className="mt-0.5 text-xl font-semibold text-white">Research worldwide. Design uniquely. Publish to WordPress.</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-400">
              Tell the agent your domain, business, and city. It surveys top sites, drafts pages with AI-Overview-optimized content, and deploys to your Hostinger WordPress. ~2–3 hours, mostly unattended.
            </p>
          </div>
          <button onClick={onNew} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
            Start build <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-950/60">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <div className="text-sm font-semibold text-white">In progress</div>
          <span className="text-xs text-slate-500">{jobs.length} active builds</span>
        </div>
        <div className="divide-y divide-slate-800">
          {jobs.map((j) => (
            <button key={j.name} onClick={onOpen} className="grid w-full grid-cols-12 items-center gap-3 px-5 py-4 text-left hover:bg-slate-900/40">
              <div className="col-span-4">
                <div className="text-sm font-medium text-white">{j.name}</div>
                <div className="text-[11px] text-slate-500">{j.domain}</div>
              </div>
              <div className="col-span-3 flex items-center gap-2 text-xs text-slate-300">
                <Activity className="h-3.5 w-3.5 text-cyan-300" /> {j.phase}
              </div>
              <div className="col-span-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${j.pct}%` }} />
                </div>
              </div>
              <div className="col-span-1 text-right text-xs font-mono text-cyan-200">{j.pct}%</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-white">How the agent works</div>
          <span className="text-[11px] text-slate-500">Eight phases · you approve each</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {PHASES.map((p, i) => (
            <div key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-400/20">
                <p.icon className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <span className="font-mono text-[10px] text-slate-500">0{i + 1}</span>
                  {p.title}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">{p.blurb}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────── New Site Form ─────────────────────────── */

function NewSiteForm({ onStart }: { onStart: () => void }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onStart(); }} className="mx-auto max-w-3xl space-y-4">
      <Section icon={FileText} title="Business" desc="Two required. Domain optional — you can set it later.">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Business name *" placeholder="Bright Smile Dental" required />
          <Field label="Niche / industry *" placeholder="dental clinic, yoga studio, law firm" required />
          <Field label="Domain (optional)" placeholder="brightsmiledental.com" />
          <Field label="Target city *" placeholder="Dubai" required />
          <Field label="Region / province" placeholder="United Arab Emirates" />
          <Field label="Services offered" placeholder="teeth whitening, implants, checkups" />
        </div>
      </Section>

      <Section icon={Palette} title="Content source" desc="How the agent handles copy.">
        <Radios
          name="content"
          options={[
            { id: "agent", label: "Let the agent write everything", desc: "Uses Design DNA + research to draft every page." },
            { id: "provided", label: "Use content I provide", desc: "Stays strict to your content; only fills schema, meta, internal links." },
            { id: "hybrid", label: "Hybrid — I'll write bones, agent expands", desc: "Your outline drives structure; agent fills the body." },
          ]}
          defaultId="agent"
        />
        <textarea
          rows={3}
          placeholder="Paste existing copy, brand notes, must-haves, things to avoid."
          className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
      </Section>

      <Section icon={Globe2} title="Design direction" desc="The agent surveys global best-in-class sites in your niche.">
        <Radios
          name="design"
          options={[
            { id: "global", label: "Survey globally + synthesize", desc: "Picks 10–12 international references and produces a Design DNA unique to your city." },
            { id: "urls", label: "Use specific examples I provide", desc: "Skips the survey; only uses the URLs below." },
          ]}
          defaultId="global"
        />
        <textarea
          rows={2}
          placeholder={"https://example1.com\nhttps://example2.com"}
          className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-500"
        />
      </Section>

      <div className="flex items-center justify-between rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-3.5">
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-white">Next:</span> ~15 min global research → you approve → Design DNA → …
          <br />
          <span className="text-slate-500">Total estimated build time: 1–3 hours of agent work across all phases.</span>
        </div>
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
          Start build · queue research <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function Section({ icon: Icon, title, desc, children }: { icon: typeof FileText; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-400/20">
          <Icon className="h-4 w-4 text-cyan-300" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="text-[11px] text-slate-400">{desc}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, placeholder, required }: { label: string; placeholder: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <input
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-400/40"
      />
    </label>
  );
}

function Radios({ name, options, defaultId }: { name: string; options: { id: string; label: string; desc: string }[]; defaultId: string }) {
  const [val, setVal] = useState(defaultId);
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const active = val === o.id;
        return (
          <label
            key={o.id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition ${
              active ? "border-cyan-400/50 bg-cyan-500/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
            }`}
          >
            <input type="radio" name={name} checked={active} onChange={() => setVal(o.id)} className="mt-0.5 h-3.5 w-3.5 accent-cyan-400" />
            <div>
              <div className={`text-sm font-medium ${active ? "text-white" : "text-slate-200"}`}>{o.label}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">{o.desc}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

/* ────────────────────────────── Build Progress ────────────────────────── */

function BuildProgress() {
  const [current, setCurrent] = useState(1); // running phase index
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setPct((p) => {
        if (p >= 100) {
          setCurrent((c) => Math.min(c + 1, PHASES.length - 1));
          return 0;
        }
        return p + 3;
      });
    }, 350);
    return () => clearInterval(t);
  }, []);

  const overall = Math.round(((current + pct / 100) / PHASES.length) * 100);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Left rail: phase list */}
      <aside className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pipeline</div>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-mono text-cyan-200">{overall}%</span>
        </div>
        <ol className="relative space-y-1">
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-800" aria-hidden />
          {PHASES.map((p, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={p.id} className={`relative flex items-center gap-3 rounded-lg px-2 py-2 ${active ? "bg-cyan-500/10 ring-1 ring-cyan-400/30" : ""}`}>
                <div className={`relative z-10 grid h-8 w-8 place-items-center rounded-full ${done ? "bg-emerald-400 text-slate-950" : active ? "bg-cyan-400 text-slate-950" : "bg-slate-900 text-slate-500 ring-1 ring-slate-800"}`}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[13px] ${active ? "font-semibold text-white" : done ? "text-slate-300" : "text-slate-500"}`}>{p.title}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    {done ? "Completed" : active ? "Running" : "Pending"}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Right: current phase detail */}
      <section className="space-y-4">
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-950 to-blue-950/30 p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400/30 to-blue-600/30 ring-1 ring-cyan-400/40">
              {(() => { const I = PHASES[current].icon; return <I className="h-6 w-6 text-cyan-200" />; })()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">Current phase · {current + 1} of {PHASES.length}</div>
              <h2 className="mt-0.5 text-xl font-semibold text-white">{PHASES[current].title}</h2>
              <p className="mt-1 text-xs text-slate-400">{PHASES[current].blurb}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <Loader2 className="h-3 w-3 animate-spin" /> Running
            </span>
          </div>
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Phase progress</span>
              <span className="font-mono text-cyan-200">{Math.min(pct, 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_10px_rgba(34,211,238,0.6)] transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="mt-2 flex items-center gap-4 text-[10px] uppercase tracking-wider text-slate-500">
              <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 text-cyan-300" /> Mac worker · Claude subscription</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" /> ~6 min remaining</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { l: "Facts extracted", v: "42", i: FileText },
            { l: "Refs surveyed", v: "11", i: Globe2 },
            { l: "Elapsed", v: "00:36", i: Clock },
          ].map((c) => (
            <div key={c.l} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-slate-500">{c.l}</span>
                <c.i className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="mt-1.5 text-2xl font-semibold text-white">{c.v}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-white">Live agent log</div>
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Streaming
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
            <div><span className="text-cyan-300">[07:12:44]</span> Discovery call parsed · claude-haiku-4-5 · 1.2s</div>
            <div><span className="text-cyan-300">[07:12:45]</span> Surveying niche: dental clinic Dubai</div>
            <div><span className="text-cyan-300">[07:12:47]</span> +brightsmile.example.com (DR 62)</div>
            <div><span className="text-cyan-300">[07:12:48]</span> +sfsmiles.example.com (DR 58)</div>
            <div><span className="text-cyan-300">[07:12:50]</span> +smilecare.example.co (DR 71)</div>
            <div><span className="text-emerald-300">[07:12:52]</span> 42 unique service concepts synthesized</div>
            <div><span className="text-cyan-300">[07:12:53]</span> Extracting palette candidates…</div>
          </div>
        </div>
      </section>
    </div>
  );
}
