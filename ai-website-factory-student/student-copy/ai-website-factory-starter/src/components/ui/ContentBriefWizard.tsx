"use client";

/**
 * Phase 2 — Content Brief Wizard (client island).
 *
 * A 3-step, role-aware flow over the Phase-1 brief engine + the Phase-2
 * generate-from-brief action. It does NOT re-implement any brief logic — it
 * calls the server actions:
 *   - proposeBriefAction({ siteId, pageType, targetKeyword })
 *   - proposeAndGenerateAction(...)            (fast-path, one click)
 *   - approveBriefAction(briefId, edits?)      (with operator edits)
 *   - generateFromBriefAction(briefId)
 *
 * Step 1 — pick site + page type + target keyword.
 * Step 2 — review the proposed brief: word count, 3 headline + meta options
 *          (selectable), full H2/H3 outline (editable) with purpose + pillars,
 *          7-pillar checklist, AI-Overview ScoreRing + reasons, schema plan,
 *          internal-link targets, and prominently the "needs business fact" gaps.
 * Step 3 — approve & generate: queues the Mac-worker draft, links to the
 *          content pipeline, and is honest that the draft still passes the
 *          quality gate before publish.
 *
 * Obsidian palette + shared atoms; mobile-friendly; inline toast on actions.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Pill } from "@/components/ui/Row";
import { PrimaryCta, GhostButton } from "@/components/ui/ObsidianAtoms";
import {
  proposeBriefAction,
  proposeAndGenerateAction,
  approveBriefAction,
  generateFromBriefAction,
  queueSharpenHeadlinesAction,
  getSharpenResultAction,
} from "@/app/actions/content-brief";
import type { ContentBriefPlan } from "@/lib/content-brief-engine";

// Page types + labels mirror engine PAGE_TYPES (kept as plain data so this
// client island never imports the server-only engine module).
const PAGE_TYPE_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: "home", label: "Home", hint: "The front door — promise, proof, paths" },
  { value: "service", label: "Service", hint: "One service, problem → solution → book" },
  { value: "area", label: "Area / Location", hint: "Hyper-local page for a city / neighborhood" },
  { value: "blog", label: "Blog (capsule)", hint: "Question-led, citable, AI-Overview-shaped" },
  { value: "about", label: "About", hint: "E-E-A-T: story, team, credentials" },
  { value: "contact", label: "Contact", hint: "NAP + service area + quote form" },
  { value: "pricing", label: "Pricing", hint: "Answer-first cost page + drivers" },
  { value: "faq", label: "FAQ (as content)", hint: "On-page Q&A (no FAQ schema)" },
];

// Intent → badge styling (mirrors INTENT_META in lib/semrush; kept local so this
// client island doesn't import server-only modules).
const INTENT_UI: Record<string, { label: string; cls: string }> = {
  transactional: { label: "Transactional", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  commercial: { label: "Commercial", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  informational: { label: "Informational", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  navigational: { label: "Navigational", cls: "bg-accent/15 text-accent border-accent/30" },
};
const PAGE_LABEL: Record<string, string> = Object.fromEntries(PAGE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

function IntentChip({ intent, fromSemrush }: { intent: string; fromSemrush?: boolean }) {
  const m = INTENT_UI[intent];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${m?.cls ?? "border-border text-text-muted"}`}
      title={fromSemrush === false ? "Estimated from the keyword text" : "From SEMrush keyword intent"}
    >
      {m?.label ?? intent}
      {fromSemrush === false ? <span className="opacity-60">~</span> : null}
    </span>
  );
}

/** One labelled row of keyword chips in the brief's keyword panel. */
function KwGroup({ label, words, tone }: { label: string; words: string[]; tone?: "accent" }) {
  const list = Array.from(new Set((words || []).filter(Boolean)));
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
      <span className="mt-0.5 shrink-0 text-xs uppercase tracking-[0.05em] text-text-faint sm:w-32">
        {label} <span className="opacity-60">({list.length})</span>
      </span>
      <div className="flex flex-1 flex-wrap gap-1">
        {list.map((w) => (
          <span
            key={w}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              tone === "accent" ? "border-accent/40 bg-accent/15 text-accent" : "border-border bg-surface-2 text-text-muted"
            }`}
          >
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}

interface SiteOption {
  id: string;
  name: string;
  city: string | null;
}

type ToastState = { kind: "ok" | "err"; msg: string } | null;

export function ContentBriefWizard({ sites }: { sites: SiteOption[] }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastState>(null);

  // Step 1 inputs
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [pageType, setPageType] = useState("service");
  const [targetKeyword, setTargetKeyword] = useState("");

  // Step 2 state — the proposed brief + operator edits
  const [briefId, setBriefId] = useState<string | null>(null);
  const [plan, setPlan] = useState<ContentBriefPlan | null>(null);
  const [headlineIdx, setHeadlineIdx] = useState(0);
  const [metaIdx, setMetaIdx] = useState(0);
  const [editHeadline, setEditHeadline] = useState("");
  const [editOutline, setEditOutline] = useState<ContentBriefPlan["outline"]>([]);

  // Step 3 state
  const [jobId, setJobId] = useState<string | null>(null);

  // AI headline sharpener state (Mac-worker job, polled).
  const [sharpening, setSharpening] = useState(false);

  function flash(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 6000);
  }

  function loadPlanIntoEditors(p: ContentBriefPlan) {
    setPlan(p);
    setHeadlineIdx(0);
    setMetaIdx(0);
    setEditHeadline(p.headlineOptions[0] ?? "");
    setEditOutline(p.outline.map((s) => ({ ...s, h3: [...s.h3], pillarsCovered: [...s.pillarsCovered] })));
  }

  // ── Step 1 actions ──────────────────────────────────────────────
  function onPropose() {
    if (!siteId) return flash("err", "Pick a site first.");
    if (!targetKeyword.trim()) return flash("err", "Enter a target keyword.");
    startTransition(async () => {
      const res = await proposeBriefAction({ siteId, pageType: pageType as never, targetKeyword: targetKeyword.trim() });
      if (!res.ok) return flash("err", `Couldn't propose brief: ${res.error}`);
      setBriefId(res.brief.id);
      loadPlanIntoEditors(res.plan);
      setStep(2);
      flash("ok", "Brief proposed — review it below.");
    });
  }

  function onProposeAndGenerate() {
    if (!siteId) return flash("err", "Pick a site first.");
    if (!targetKeyword.trim()) return flash("err", "Enter a target keyword.");
    startTransition(async () => {
      const res = await proposeAndGenerateAction({ siteId, pageType: pageType as never, targetKeyword: targetKeyword.trim() });
      if (!res.ok) return flash("err", `Fast-path failed: ${res.error}`);
      setBriefId(res.briefId);
      setJobId(res.jobId);
      setPlan(res.plan);
      setStep(3);
      flash("ok", "Proposed, approved, and queued for generation.");
    });
  }

  // ── Step 2 → 3: approve (with edits) then generate ─────────────────
  function onApproveAndGenerate() {
    if (!briefId) return;
    // Move the editor's chosen headline + meta title to index 0 so the
    // generator + approveBriefAction record the pick.
    const headlines = [...(plan?.headlineOptions ?? [])];
    const chosen = editHeadline.trim() || headlines[headlineIdx] || headlines[0] || "";
    const orderedHeadlines = [chosen, ...headlines.filter((h) => h !== chosen)];
    const metas = [...(plan?.metaTitleOptions ?? [])];
    const orderedMetas = metas.length ? [metas[metaIdx] ?? metas[0], ...metas.filter((_, i) => i !== metaIdx)] : metas;

    startTransition(async () => {
      const approved = await approveBriefAction(briefId, {
        title: chosen,
        headlineOptions: orderedHeadlines,
        metaTitleOptions: orderedMetas,
        outline: editOutline,
      });
      if (!approved.ok) return flash("err", `Approve failed: ${approved.error}`);
      const gen = await generateFromBriefAction(briefId);
      if (!gen.ok) return flash("err", `Generate failed: ${gen.error}`);
      setJobId(gen.jobId);
      setStep(3);
      flash("ok", "Approved + queued. The Mac worker is writing the draft.");
    });
  }

  // ── AI headline sharpener (Mac worker, no API) ────────────────────
  function onSharpen() {
    if (!plan || sharpening) return;
    const heads = editOutline.map((s) => s.h2).filter(Boolean);
    if (heads.length === 0) return;
    setSharpening(true);
    flash("ok", "Sharpening headlines on the Mac worker — no API cost…");
    void (async () => {
      const q = await queueSharpenHeadlinesAction({
        pageType: pageType as never,
        targetKeyword: plan.targetKeyword,
        headlines: editOutline.map((s) => s.h2),
        keywords: {
          head: plan.keywords.head,
          longTail: plan.keywords.longTail,
          lsi: plan.keywords.lsi,
          questions: plan.keywords.questions,
        },
        city: plan.geoEntities?.[0],
      });
      if (!q.ok) {
        setSharpening(false);
        return flash("err", `Couldn't queue sharpen: ${q.error}`);
      }
      let tries = 0;
      const poll = async () => {
        tries += 1;
        const r = await getSharpenResultAction(q.jobId);
        if (!r.ok) {
          setSharpening(false);
          return flash("err", `Sharpen failed: ${r.error}`);
        }
        if (r.status === "failed") {
          setSharpening(false);
          return flash("err", "Sharpen job failed on the worker.");
        }
        if (r.status === "done") {
          setSharpening(false);
          if (r.headlines && r.headlines.length) {
            setEditOutline((prev) => prev.map((s, i) => (r.headlines![i] ? { ...s, h2: r.headlines![i] } : s)));
            flash("ok", "Headlines sharpened ✨ — review + edit before approving.");
          } else {
            flash("err", "Sharpen finished but no headlines were returned.");
          }
          return;
        }
        if (tries > 40) {
          setSharpening(false);
          return flash("err", "Sharpen timed out (~3 min) — is the Mac worker running?");
        }
        window.setTimeout(poll, 5000);
      };
      window.setTimeout(poll, 4000);
    })();
  }

  function updateOutlineH2(i: number, value: string) {
    setEditOutline((prev) => prev.map((s, idx) => (idx === i ? { ...s, h2: value } : s)));
  }
  function updateOutlinePurpose(i: number, value: string) {
    setEditOutline((prev) => prev.map((s, idx) => (idx === i ? { ...s, purpose: value } : s)));
  }

  return (
    <div className="space-y-6">
      <StepRail step={step} />

      {/* Inline toast */}
      {toast ? (
        <div
          className={`flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-xs ${
            toast.kind === "ok"
              ? "border-success/40 bg-success-tint text-success"
              : "border-danger/40 bg-danger-tint text-danger"
          }`}
        >
          <span>{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} className="rounded-sm px-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      {step === 1 ? (
        <StepOne
          sites={sites}
          siteId={siteId}
          setSiteId={setSiteId}
          pageType={pageType}
          setPageType={setPageType}
          targetKeyword={targetKeyword}
          setTargetKeyword={setTargetKeyword}
          pending={pending}
          onPropose={onPropose}
          onProposeAndGenerate={onProposeAndGenerate}
        />
      ) : null}

      {step === 2 && plan ? (
        <StepTwo
          plan={plan}
          headlineIdx={headlineIdx}
          setHeadlineIdx={(i) => {
            setHeadlineIdx(i);
            setEditHeadline(plan.headlineOptions[i] ?? "");
          }}
          metaIdx={metaIdx}
          setMetaIdx={setMetaIdx}
          editHeadline={editHeadline}
          setEditHeadline={setEditHeadline}
          editOutline={editOutline}
          updateOutlineH2={updateOutlineH2}
          updateOutlinePurpose={updateOutlinePurpose}
          pending={pending}
          sharpening={sharpening}
          onSharpen={onSharpen}
          onBack={() => setStep(1)}
          onApproveAndGenerate={onApproveAndGenerate}
        />
      ) : null}

      {step === 3 ? <StepThree jobId={jobId} briefId={briefId} plan={plan} /> : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Step rail
// ────────────────────────────────────────────────────────────────
function StepRail({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Pick" },
    { n: 2, label: "Review brief" },
    { n: 3, label: "Generate" },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium ${
              step === s.n
                ? "border-accent bg-accent text-brand-navy-deep"
                : step > s.n
                  ? "border-success/50 bg-success-tint text-success"
                  : "border-border bg-surface text-text-faint"
            }`}
          >
            {step > s.n ? "✓" : s.n}
          </span>
          <span className={step === s.n ? "font-medium text-text" : "text-text-faint"}>{s.label}</span>
          {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

// ────────────────────────────────────────────────────────────────
// Step 1 — pick
// ────────────────────────────────────────────────────────────────
function StepOne(props: {
  sites: SiteOption[];
  siteId: string;
  setSiteId: (v: string) => void;
  pageType: string;
  setPageType: (v: string) => void;
  targetKeyword: string;
  setTargetKeyword: (v: string) => void;
  pending: boolean;
  onPropose: () => void;
  onProposeAndGenerate: () => void;
}) {
  const { sites, siteId, setSiteId, pageType, setPageType, targetKeyword, setTargetKeyword, pending, onPropose, onProposeAndGenerate } = props;
  return (
    <div className="space-y-5 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-text">Site</span>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {sites.length === 0 ? <option value="">No connected sites</option> : null}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.city ? ` — ${s.city}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text">Target keyword</span>
          <input
            value={targetKeyword}
            onChange={(e) => setTargetKeyword(e.target.value)}
            placeholder="villa deep cleaning palm jumeirah"
            className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
      </div>

      <div>
        <span className="text-xs font-medium text-text">Page type</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PAGE_TYPE_OPTIONS.map((pt) => (
            <button
              key={pt.value}
              type="button"
              onClick={() => setPageType(pt.value)}
              className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                pageType === pt.value
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <span className="block text-xs font-medium text-text">{pt.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-text-faint">{pt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[52ch] text-xs leading-relaxed text-text-faint">
          The engine grounds the brief in this site&rsquo;s real facts (GBP, business facts, SEMrush) — it flags
          missing facts instead of inventing them.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton onClick={onProposeAndGenerate} disabled={pending}>
            {pending ? "Working…" : "Propose + generate now"}
          </GhostButton>
          <PrimaryCta onClick={onPropose} disabled={pending}>
            {pending ? "Proposing…" : "Propose brief"}
          </PrimaryCta>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Step 2 — review the proposed brief
// ────────────────────────────────────────────────────────────────
function StepTwo(props: {
  plan: ContentBriefPlan;
  headlineIdx: number;
  setHeadlineIdx: (i: number) => void;
  metaIdx: number;
  setMetaIdx: (i: number) => void;
  editHeadline: string;
  setEditHeadline: (v: string) => void;
  editOutline: ContentBriefPlan["outline"];
  updateOutlineH2: (i: number, v: string) => void;
  updateOutlinePurpose: (i: number, v: string) => void;
  pending: boolean;
  sharpening: boolean;
  onSharpen: () => void;
  onBack: () => void;
  onApproveAndGenerate: () => void;
}) {
  const {
    plan,
    headlineIdx,
    setHeadlineIdx,
    metaIdx,
    setMetaIdx,
    editHeadline,
    setEditHeadline,
    editOutline,
    updateOutlineH2,
    updateOutlinePurpose,
    pending,
    sharpening,
    onSharpen,
    onBack,
    onApproveAndGenerate,
  } = props;

  const satisfied = plan.pillarChecklist.filter((p) => p.satisfied).length;

  return (
    <div className="space-y-5">
      {/* Top summary row: score ring + word count + intent + source */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
          <ScoreRing label="AI-Overview" value={plan.aiOverviewScore} size="md" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-text">AI-Overview readiness</p>
            <p className="mt-0.5 text-xs leading-snug text-text-faint">
              Structuring score — built for citation, not a guarantee of ranking.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Word-count target</p>
          <p className="tnum mt-1 text-xl font-medium text-text">
            {plan.wordCountTarget.min}–{plan.wordCountTarget.max}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-faint">
            <IntentChip intent={plan.intent} fromSemrush={plan.intentPlan?.fromSemrush} /> · {plan.vertical}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-[0.06em] text-text-faint">Pillars satisfied</p>
          <p className="tnum mt-1 text-xl font-medium text-text">{satisfied}/7</p>
          <p className="mt-0.5 text-xs text-text-faint">
            Keyword data: {plan.keywords.source === "semrush" ? "SEMrush" : "synthesized (no key)"}
          </p>
        </div>
      </div>

      {/* Intent → page-type fit (drives content planning) */}
      {plan.intentPlan ? (
        <div
          className={`rounded-lg border p-3.5 ${
            plan.intentPlan.matchesChosen ? "border-success/40 bg-success-tint" : "border-amber-500/40 bg-amber-500/10"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <IntentChip intent={plan.intentPlan.detectedIntent} fromSemrush={plan.intentPlan.fromSemrush} />
            <span className="text-xs font-medium text-text">
              {plan.intentPlan.matchesChosen
                ? "Intent matches the page type ✓"
                : `This keyword wants a ${PAGE_LABEL[plan.intentPlan.recommendedPageType] ?? plan.intentPlan.recommendedPageType} page`}
            </span>
          </div>
          <p className="mt-1 text-xs leading-snug text-text-muted">
            {plan.intentPlan.note}
            {!plan.intentPlan.matchesChosen ? " Go ← Back to switch the page type, or keep it if you have a reason." : ""}
          </p>
        </div>
      ) : null}

      {/* Keywords this page targets — the full SEMrush set, woven into the brief */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-text">Keywords this page targets</p>
          <span className="text-xs text-text-faint">
            {plan.keywords.source === "semrush" ? "Live SEMrush" : "synthesized (no SEMrush key)"}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-text-faint">
          Pulled from keyword research and woven into the brief — the primary keyword leads the H1 + first 100 words;
          long-tail, LSI, and questions are spread across the sections below.
        </p>
        <div className="mt-3 space-y-2.5">
          <KwGroup label="Primary" tone="accent" words={[plan.targetKeyword]} />
          <KwGroup
            label="Variations"
            words={plan.keywords.head.filter((k) => k.toLowerCase() !== plan.targetKeyword.toLowerCase())}
          />
          <KwGroup label="Long-tail" words={plan.keywords.longTail} />
          <KwGroup label="LSI / related" words={plan.keywords.lsi} />
          <KwGroup label="Questions (PAA)" words={plan.keywords.questions} />
          <KwGroup label="Near me / local" words={plan.keywords.nearMe} />
          <KwGroup label="AI-Overview" words={plan.keywords.aiOverviewTriggers} />
        </div>
      </div>

      {/* Needs-business-fact gaps — prominent */}
      {plan.needsBusinessFacts.length > 0 ? (
        <div className="rounded-lg border border-warning/40 bg-warning-tint p-4">
          <p className="text-xs font-medium text-warning">
            ⚠ Needs business facts ({plan.needsBusinessFacts.length}) — fill these to ground the page
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {plan.needsBusinessFacts.map((g, i) => (
              <li key={i} className="text-xs text-text">
                <span className="text-warning">•</span> {g}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            The writer will work around these gaps and never invent them. Add them in the site&rsquo;s business facts
            for a stronger, anti-generic page.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-success/40 bg-success-tint px-3.5 py-2 text-xs text-success">
          ✓ No missing business facts — the brief is fully grounded.
        </div>
      )}

      {/* Headline + meta picker */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-text">Headline (H1) — pick or edit</p>
          <div className="mt-2 space-y-2">
            {plan.headlineOptions.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHeadlineIdx(i)}
                className={`block w-full rounded-md border px-3 py-2 text-left text-xs ${
                  headlineIdx === i ? "border-accent bg-accent/10 text-text" : "border-border bg-surface text-text-muted hover:border-border-strong"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
          <input
            value={editHeadline}
            onChange={(e) => setEditHeadline(e.target.value)}
            placeholder="…or write your own H1"
            className="mt-2 w-full rounded-md border border-border bg-surface px-2.5 py-2 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-text">Meta title — pick</p>
          <div className="mt-2 space-y-2">
            {plan.metaTitleOptions.length === 0 ? (
              <p className="text-xs text-text-faint">No meta titles proposed.</p>
            ) : (
              plan.metaTitleOptions.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setMetaIdx(i)}
                  className={`block w-full rounded-md border px-3 py-2 text-left text-xs ${
                    metaIdx === i ? "border-accent bg-accent/10 text-text" : "border-border bg-surface text-text-muted hover:border-border-strong"
                  }`}
                >
                  <span className="tnum mr-2 text-xs text-text-faint">{m.length}c</span>
                  {m}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Outline — editable */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-text">Outline ({editOutline.length} sections) — H2 + purpose are editable</p>
          <button
            type="button"
            onClick={onSharpen}
            disabled={sharpening || pending}
            title="Rewrite every section headline with AI using this page's keywords — runs on the Mac worker, no API cost"
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {sharpening ? (
              <>
                <span className="live-dot" aria-hidden />
                Sharpening on Mac worker…
              </>
            ) : (
              <>✨ Sharpen with AI</>
            )}
          </button>
        </div>
        {sharpening ? (
          <p className="mt-1 text-xs text-text-faint">
            Rewriting each H2 with the page&rsquo;s harvested keywords — this takes ~30–90s on the worker. You can keep editing other fields.
          </p>
        ) : null}
        <div className="mt-3 space-y-3">
          {editOutline.map((sec, i) => (
            <div key={i} className="rounded-md border border-border bg-surface-soft p-3">
              <div className="flex items-start gap-2">
                <span className="tnum mt-1.5 text-xs text-text-faint">{i + 1}.</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    value={sec.h2}
                    onChange={(e) => updateOutlineH2(i, e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                  <textarea
                    value={sec.purpose}
                    onChange={(e) => updateOutlinePurpose(i, e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                  {sec.h3.length > 0 ? (
                    <p className="text-xs text-text-faint">
                      <span className="text-text-muted">H3:</span> {sec.h3.join(" · ")}
                    </p>
                  ) : null}
                  {sec.pillarsCovered.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {sec.pillarsCovered.map((p) => (
                        <span key={p} className="rounded-sm bg-surface-2 px-1.5 py-px text-xs text-text-muted">
                          {p}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pillar checklist + AIO reasons */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-text">7 local-SEO pillars</p>
          <ul className="mt-2 space-y-1.5">
            {plan.pillarChecklist.map((p) => (
              <li key={p.pillar} className="flex items-start gap-2 text-xs">
                <span className={p.satisfied ? "text-success" : "text-warning"}>{p.satisfied ? "✓" : "▲"}</span>
                <span className="min-w-0">
                  <span className="text-text">{p.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-text-faint">{p.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs font-medium text-text">Why this score</p>
            <ul className="mt-2 space-y-1">
              {plan.aiOverviewReadiness.reasons.map((r, i) => (
                <li key={i} className="text-xs leading-snug text-text-muted">
                  {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs font-medium text-text">Schema plan</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.schemaPlan.types.map((t) => (
                <Pill key={t} tone="accent">
                  {t}
                </Pill>
              ))}
              {plan.schemaPlan.avoid.map((t) => (
                <Pill key={t} tone="neutral">
                  avoid: {t}
                </Pill>
              ))}
            </div>
            {plan.internalLinkTargets.length > 0 ? (
              <>
                <p className="mt-3 text-xs uppercase tracking-[0.06em] text-text-faint">Internal links</p>
                <p className="mt-1 font-mono text-xs text-text-muted">{plan.internalLinkTargets.join("  ·  ")}</p>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* AI-Overview answer block preview */}
      {plan.aiOverviewAnswerBlock ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-medium text-text">AI-Overview answer block (answer-first)</p>
          <p className="mt-2 max-w-[72ch] text-xs leading-relaxed text-text-muted">{plan.aiOverviewAnswerBlock}</p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <GhostButton onClick={onBack} disabled={pending}>
          ← Back
        </GhostButton>
        <div className="flex items-center gap-2">
          <p className="hidden text-xs text-text-faint sm:block">Approving sends the draft to the Mac worker, then the quality gate.</p>
          <PrimaryCta onClick={onApproveAndGenerate} disabled={pending}>
            {pending ? "Queuing…" : "Approve & generate"}
          </PrimaryCta>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Step 3 — queued
// ────────────────────────────────────────────────────────────────
function StepThree({ jobId, briefId, plan }: { jobId: string | null; briefId: string | null; plan: ContentBriefPlan | null }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-accent/50 bg-accent/10 text-xl text-accent">
        ✶
      </div>
      <div>
        <p className="text-base font-medium text-text">Mac worker is writing the draft…</p>
        <p className="mx-auto mt-1.5 max-w-[60ch] text-xs leading-relaxed text-text-muted">
          The approved brief was handed to a <strong className="text-text">build:page_generate</strong> job on the
          Claude Code subscription (no API spend). When it finishes, the draft lands in the content pipeline in{" "}
          <strong className="text-text">review</strong>.
        </p>
      </div>

      <div className="mx-auto max-w-md rounded-md border border-border bg-surface-soft px-3.5 py-3 text-left text-xs leading-relaxed text-text-muted">
        <p className="font-medium text-text">Honest note on quality gating</p>
        <p className="mt-1">
          This is <em>not</em> auto-published. The generated draft still has to clear the existing quality gate (critic
          verdict + the publish gauntlet&rsquo;s schema / E-E-A-T / authenticity / doorway / accessibility checks)
          before it can go to <strong className="text-text">published</strong>.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {briefId ? <PrimaryCta href={`/admin/content/${briefId}`}>Open the draft in the pipeline →</PrimaryCta> : null}
        {jobId ? (
          <Link href={`/admin/agent/jobs/${jobId}`} className="text-xs text-text-faint underline hover:text-text">
            View the job
          </Link>
        ) : null}
        <Link href="/admin/content/brief" className="text-xs text-text-faint underline hover:text-text">
          Start another
        </Link>
      </div>

      {plan ? (
        <p className="text-xs text-text-faint">
          {plan.pageType} · {plan.targetKeyword} · AI-Overview readiness {plan.aiOverviewScore}/100
        </p>
      ) : null}
    </div>
  );
}
