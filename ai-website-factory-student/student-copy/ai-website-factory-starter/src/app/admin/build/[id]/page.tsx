/**
 * /admin/build/[id] — Per-project workspace.
 *
 * Left rail: phase progress. Right pane: current phase content + jobs
 * being run for that phase + "Approve & continue" CTA when done.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, siteBuildProjects, siteBuildPages } from "@/db/schema";
import {
  advancePhaseAction,
  deleteBuildProjectAction,
  deployToWordPressAction,
  generateAllPendingPagesAction,
} from "@/app/actions/site-build";
import { Pill } from "@/components/ui/Row";
import { AgentWorking } from "@/components/ui/AgentWorking";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { evaluatePhaseGate } from "@/lib/build-gates";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { BusinessContextStep } from "./BusinessContextStep";

export const dynamic = "force-dynamic";

const PHASES = [
  { key: "brief",    label: "Brief" },
  { key: "research", label: "Global research" },
  { key: "dna",      label: "Design DNA" },
  { key: "sitemap",  label: "Sitemap" },
  { key: "pages",    label: "Pages" },
  { key: "review",   label: "Quality review" },
  { key: "deploy",   label: "Deploy" },
  { key: "live",     label: "Live" },
] as const;

const PHASE_TO_JOB_KIND: Record<string, string | null> = {
  brief: null,
  research: "build:global_research",
  dna: "build:design_dna",
  sitemap: "build:sitemap_plan",
  pages: "build:page_generate",
  review: "build:quality_review",
  deploy: null,
  live: null,
};

export default async function BuildProjectPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { queued?: string; deployed?: string; failed?: string; error?: string; forced?: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, params.id))
    .limit(1);
  if (!project) notFound();

  // Most recent job for the current phase
  const currentJobKind = PHASE_TO_JOB_KIND[project.phase];
  const recentJobs = currentJobKind
    ? await db()
        .select()
        .from(claudeJobs)
        .where(sql`${claudeJobs.kind} = ${currentJobKind} AND ${claudeJobs.input}->>'projectId' = ${project.id}`)
        .orderBy(desc(claudeJobs.createdAt))
        .limit(3)
    : [];

  const pages = await db()
    .select()
    .from(siteBuildPages)
    .where(eq(siteBuildPages.projectId, project.id))
    .orderBy(siteBuildPages.sortOrder);

  const phaseIdx = PHASES.findIndex((p) => p.key === project.phase);
  const nextPhase = PHASES[phaseIdx + 1];
  const currentJob = recentJobs[0];
  const jobDone = currentJob?.status === "done";

  // Phase quality gate — replaces the old `jobDone && nextPhase` heuristic.
  // The job being "done" only means the worker returned successfully; the
  // gate inspects the actual content and decides whether the output is
  // strong enough to ship to the next phase.
  const gate = evaluatePhaseGate(
    project.phase as Parameters<typeof evaluatePhaseGate>[0],
    project,
    currentJob,
    pages,
  );
  const phaseRequiresJob = !!PHASE_TO_JOB_KIND[project.phase];
  const phaseHasNoJob = !phaseRequiresJob; // brief, deploy, live — no job to wait on
  const phaseReady = phaseHasNoJob || jobDone;
  const canAdvance = phaseReady && !!nextPhase && gate.ok;
  const canForceAdvance = phaseReady && !!nextPhase && !gate.ok;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
      {/* ── Left rail · phase progress ──────────────────────────── */}
      <aside className="space-y-3">
        <header className="space-y-1">
          <Link href="/admin/build" className="text-xs text-text-faint hover:text-text">
            ← All builds
          </Link>
          <h1 className="text-xl font-medium tracking-tightish text-text">{project.businessName}</h1>
          <p className="text-xs text-text-muted">
            {project.city ?? "—"}
            {project.domain ? ` · ${project.domain}` : ""}
          </p>
        </header>

        <ol className="space-y-1">
          {PHASES.map((p, i) => {
            const isCurrent = p.key === project.phase;
            const isPast = i < phaseIdx;
            const isFuture = i > phaseIdx;
            return (
              <li
                key={p.key}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-base transition ${
                  isCurrent
                    ? "bg-accent-tint text-text"
                    : isPast
                      ? "text-text-muted"
                      : "text-text-faint"
                }`}
              >
                <span
                  className={`tnum grid h-5 w-5 shrink-0 place-items-center rounded text-xs font-medium ${
                    isPast
                      ? "bg-success text-accent-fg"
                      : isCurrent
                        ? "bg-accent text-accent-fg"
                        : "bg-surface-2 text-text-faint"
                  }`}
                >
                  {isPast ? "✓" : i + 1}
                </span>
                <span className={`flex-1 truncate ${isCurrent ? "font-medium text-text" : ""}`}>
                  {p.label}
                </span>
                {isFuture && i === phaseIdx + 1 ? (
                  <span className="text-xs text-text-faint">next</span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="space-y-2 rounded-md border border-border bg-surface p-3 text-xs">
          <p className="text-text-faint">Project meta</p>
          <p className="text-text-muted">
            Content: <span className="text-text">{project.contentSource}</span>
          </p>
          <p className="text-text-muted">
            Design: <span className="text-text">{project.designMode}</span>
          </p>
          {(project.services as string[]).length > 0 ? (
            <p className="text-text-muted">
              Services: <span className="text-text">{(project.services as string[]).join(", ")}</span>
            </p>
          ) : null}
          <p className="text-text-faint">Updated {formatRelative(project.updatedAt)}</p>
        </div>

        <Link
          href={`/admin/build/${project.id}/schedule`}
          className="block rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-muted hover:border-accent hover:text-accent"
        >
          ⏰ Scheduled workflows →
        </Link>
        <Link
          href={`/admin/rubric/build/${project.id}`}
          className="block rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-muted hover:border-accent hover:text-accent"
        >
          ✓ Rubric audit (pre-deploy gate) →
        </Link>

        <form action={deleteBuildProjectAction}>
          <input type="hidden" name="id" value={project.id} />
          <button type="submit" className="text-xs text-text-faint hover:text-danger">
            Discard project
          </button>
        </form>
      </aside>

      {/* ── Right pane · current phase content ──────────────────── */}
      <main className="space-y-6">
        {currentJob && (currentJob.status === "pending" || currentJob.status === "claimed" || currentJob.status === "running") ? (
          <AutoRefresh intervalMs={6000} />
        ) : null}
        {searchParams.queued ? (
          <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info-tint px-3 py-2 text-base text-info">
            <span className="live-dot" aria-hidden />
            <span>
              Job queued for phase: <strong>{searchParams.queued}</strong>. Your Mac worker (if running) picks it up
              within 30 seconds; otherwise the server daemon runs it.
            </span>
          </div>
        ) : null}

        {searchParams.error === "gate-blocked" ? (
          <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-base text-danger">
            Phase quality gate blocked the advance. Review the issues in the gate panel below, then click
            &quot;Force-advance&quot; if you want to push past them (the override gets logged).
          </div>
        ) : null}

        {/* Site Builder Studio — guided live-preview page builder */}
        <Link
          href={`/admin/build/${project.id}/studio`}
          className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-tint px-5 py-4 transition hover:border-accent"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
                <path d="M2 6h12M6 6v7.5" />
              </svg>
            </span>
            <div>
              <p className="text-md font-medium text-text">Open Site Builder Studio</p>
              <p className="text-xs text-text-muted">
                Guided live-preview builder — reorder sections, pick design variants, lock designs across every page type.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-md font-medium text-accent">→</span>
        </Link>

        {/* Phase headline */}
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
            Current phase
          </p>
          <h2 className="text-2xl font-medium tracking-tightish text-text">
            {PHASES[phaseIdx]?.label ?? project.phase}
          </h2>
        </header>

        {/* Job status panel */}
        {currentJobKind ? (
          recentJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-strong bg-surface px-5 py-6 text-base text-text-muted">
              No job queued yet for this phase.
            </div>
          ) : (
            <section className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-md font-medium text-text">Latest job</h3>
                <Link
                  href={`/admin/agent/jobs/${currentJob.id}`}
                  className="text-xs text-accent hover:underline"
                >
                  Open job ↗
                </Link>
              </div>
              <div className="mt-2 flex items-center gap-2 text-base">
                <Pill
                  tone={
                    currentJob.status === "done"
                      ? "success"
                      : currentJob.status === "failed"
                        ? "danger"
                        : currentJob.status === "running" || currentJob.status === "claimed"
                          ? "info"
                          : "warning"
                  }
                >
                  {currentJob.status}
                </Pill>
                <span className="font-mono text-xs text-text-faint">{currentJob.kind}</span>
                <span className="text-xs text-text-faint">
                  · created {formatRelative(currentJob.createdAt)}
                </span>
              </div>
              {currentJob.outputMarkdown ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-base font-medium text-text">
                    Preview output ({(currentJob.outputMarkdown.length / 1000).toFixed(1)}k chars)
                  </summary>
                  <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-surface-2 px-3 py-2 font-sans text-base leading-relaxed text-text">
                    {currentJob.outputMarkdown}
                  </pre>
                </details>
              ) : currentJob.status === "pending" || currentJob.status === "claimed" || currentJob.status === "running" ? (
                <AgentWorking
                  bare
                  title={`Building: ${PHASES[phaseIdx]?.label ?? project.phase}`}
                  stages={[
                    { key: "pending", label: "Queued" },
                    { key: "claimed", label: "Claimed by worker" },
                    { key: "running", label: "Generating" },
                  ]}
                  currentStage={currentJob.status}
                  messages={[
                    "Your Mac worker is running this build phase via Claude Code…",
                    "Grounding the work in the project brief + design DNA…",
                    "Output appears here the moment the phase completes…",
                  ]}
                  note="Mac worker — Claude Code subscription, no API cost"
                  startedAt={currentJob.startedAt ?? currentJob.createdAt}
                />
              ) : currentJob.error ? (
                <pre className="mt-3 whitespace-pre-wrap rounded bg-danger-tint px-3 py-2 font-mono text-xs text-danger">
                  {currentJob.error}
                </pre>
              ) : null}
            </section>
          )
        ) : (
          <p className="text-base text-text-muted">No automated job for this phase.</p>
        )}

        {/* Business context — pasted notes → extracted facts (P8). Always
            available so the operator can update facts mid-build if they
            discover something new (e.g. a phone number changes). */}
        <BusinessContextStep
          projectId={project.id}
          existing={project.businessFacts as Record<string, unknown> | null}
        />

        {/* Phase-specific helpers */}
        {(project.phase === "pages" || project.phase === "review" || project.phase === "deploy" || project.phase === "live") ? (
          <section className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h3 className="text-md font-medium text-text">Pages</h3>
                <p className="text-base text-text-muted">
                  {pages.length === 0
                    ? "No pages seeded yet — the sitemap parser runs when phase advances to pages."
                    : `${pages.length} page${pages.length === 1 ? "" : "s"} in this project.`}
                </p>
                {/* Per-status breakdown — surfaces what's left to generate / publish
                    without opening the full pages view. Counts derived from the
                    site_build_pages.status column we already loaded. */}
                {pages.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(() => {
                      const by = (s: string[]) => pages.filter((p) => s.includes(p.status)).length;
                      const segs: Array<{ label: string; n: number; tone: "success" | "accent" | "info" | "danger" | "neutral" }> = [
                        { label: "published", n: by(["published"]), tone: "success" },
                        { label: "ready", n: by(["ready", "edited"]), tone: "accent" },
                        { label: "generating", n: by(["generating"]), tone: "info" },
                        { label: "pending", n: by(["pending"]), tone: "neutral" },
                        { label: "failed", n: by(["failed"]), tone: "danger" },
                      ];
                      return segs
                        .filter((s) => s.n > 0)
                        .map((s) => (
                          <Pill key={s.label} tone={s.tone}>
                            {s.n} {s.label}
                          </Pill>
                        ));
                    })()}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {pages.filter((p) => p.status === "pending" || p.status === "failed").length > 0 ? (
                  <form action={generateAllPendingPagesAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text transition hover:border-accent hover:text-accent"
                    >
                      Generate pending →
                    </button>
                  </form>
                ) : null}
                <Link
                  href={`/admin/build/${project.id}/pages`}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
                >
                  Open pages →
                </Link>
              </div>
            </div>

            {pages.length > 0 ? (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {pages.slice(0, 8).map((pg) => {
                  // Word count from the generated Markdown body — a quick "is this
                  // thin?" signal that matters for the scaled-content classifier.
                  const words = pg.bodyMarkdown ? pg.bodyMarkdown.trim().split(/\s+/).filter(Boolean).length : 0;
                  return (
                    <li key={pg.id} className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-base">
                      <Pill tone={pg.status === "ready" || pg.status === "published" || pg.status === "edited" ? "success" : pg.status === "failed" ? "danger" : pg.status === "generating" ? "info" : "neutral"}>
                        {pg.status}
                      </Pill>
                      <Link href={`/admin/build/${project.id}/pages/${pg.id}`} className="min-w-0 flex-1 truncate text-text hover:text-accent">
                        {pg.title}
                      </Link>
                      {words > 0 ? (
                        <span className="tnum hidden text-xs text-text-faint sm:inline" title="Word count">
                          {words >= 1000 ? `${(words / 1000).toFixed(1)}k` : words}w
                        </span>
                      ) : null}
                      {pg.seoScore !== null ? (
                        <span className="tnum text-xs text-text-faint" title="Technical SEO score">SEO {pg.seoScore}</span>
                      ) : null}
                      {pg.aiOverviewScore !== null ? (
                        <span className="tnum text-xs text-text-faint" title="AI Overview readiness">AIO {pg.aiOverviewScore}</span>
                      ) : null}
                    </li>
                  );
                })}
                {pages.length > 8 ? (
                  <li className="text-xs text-text-faint">+ {pages.length - 8} more</li>
                ) : null}
              </ul>
            ) : null}
          </section>
        ) : null}

        {/* Deploy panel */}
        {(project.phase === "review" || project.phase === "deploy" || project.phase === "live") ? (
          <section className="rounded-xl border border-accent/30 bg-accent-tint p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-md font-medium text-text">
                  {project.phase === "live" ? "Deployed to WordPress" : "Ready to deploy to WordPress"}
                </h3>
                <p className="text-base text-text-muted">
                  Pushes every <span className="font-mono text-text">ready</span> / <span className="font-mono text-text">edited</span> page to the target site via the GYL Suite plugin&apos;s create-page endpoint. Schema is injected inline as <code>&lt;script type=&quot;application/ld+json&quot;&gt;</code> blocks. Post-publish QA auto-queues immediately.
                </p>
                <p className="text-xs text-text-faint">
                  Requires the target WordPress site to be connected at <Link className="text-accent underline" href="/admin/sites/connect">Sites → Connect</Link> first (plugin installed, API key active).
                </p>
              </div>
              {project.phase !== "live" ? (
                <form action={deployToWordPressAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-4 py-2 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
                  >
                    Deploy to WordPress →
                  </button>
                </form>
              ) : null}
            </div>
            {searchParams.deployed ? (
              <div className="mt-3 rounded-md border border-success/30 bg-success-tint px-3 py-2 text-base text-success">
                Deployed {searchParams.deployed} page(s).{" "}
                {searchParams.failed && searchParams.failed !== "0" ? `${searchParams.failed} failed — retry from the pages list.` : "Post-publish QA queued."}
              </div>
            ) : null}
            {searchParams.error === "no-target-site" ? (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-base text-warning">
                No WordPress site is connected for this project&apos;s domain. Connect it at <Link className="underline" href="/admin/sites/connect">Sites → Connect</Link> first, then click Deploy again.
              </div>
            ) : null}
            {searchParams.error === "no-api-key" ? (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-base text-warning">
                The target site has no active API key. Issue one from the site detail page, paste it into the WP plugin&apos;s settings, then retry.
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Phase gate panel — quality assessment of current phase output */}
        {phaseReady && nextPhase ? (
          <section
            className={`rounded-xl border p-5 ${
              gate.ok
                ? "border-success/30 bg-success-tint"
                : gate.blocking.length > 0
                  ? "border-danger/40 bg-danger-tint"
                  : "border-warning/40 bg-warning-tint"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs uppercase tracking-[0.08em] font-semibold text-text-muted">
                  Phase quality gate · {gate.phaseLabel}
                </p>
                <p className="text-sm text-text">
                  {gate.summary}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold tabular-nums tracking-tight text-text">
                  {gate.score}
                </p>
                <p className="text-xs uppercase tracking-[0.08em] text-text-faint">/100</p>
              </div>
            </div>

            {gate.blocking.length > 0 ? (
              <div className="mt-3 space-y-1">
                <p className="text-xs uppercase tracking-[0.08em] font-semibold text-danger">
                  Blocking
                </p>
                <ul className="text-xs text-text space-y-0.5">
                  {gate.blocking.map((b) => (
                    <li key={b}>• {b}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {gate.warnings.length > 0 ? (
              <div className="mt-3 space-y-1">
                <p className="text-xs uppercase tracking-[0.08em] font-semibold text-warning">
                  Warnings
                </p>
                <ul className="text-xs text-text space-y-0.5">
                  {gate.warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Advance / Deploy CTA */}
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-base font-medium text-text">
              {canAdvance
                ? `Approve "${PHASES[phaseIdx]?.label}" and start "${nextPhase?.label}"`
                : canForceAdvance
                  ? `Gate failed — advance to "${nextPhase?.label}" anyway?`
                  : phaseReady && !nextPhase
                    ? "Project complete"
                    : "Waiting for the current phase to complete"}
            </p>
            <p className="text-xs text-text-muted">
              {canAdvance
                ? "Quality gate passed. Click below — the next phase queues automatically."
                : canForceAdvance
                  ? "The gate flagged blocking issues above. You can override, but the override is logged in the audit trail."
                  : phaseReady && !nextPhase
                    ? "Every phase ran. Deploy when ready."
                    : "You'll see the approve button once the current job finishes."}
            </p>
          </div>
          {canAdvance ? (
            <form action={advancePhaseAction}>
              <input type="hidden" name="id" value={project.id} />
              <button
                type="submit"
                className="h-10 rounded-md bg-accent px-5 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
              >
                Approve · continue to {nextPhase?.label} →
              </button>
            </form>
          ) : canForceAdvance ? (
            <form action={advancePhaseAction}>
              <input type="hidden" name="id" value={project.id} />
              <input type="hidden" name="force" value="1" />
              <button
                type="submit"
                className="h-10 rounded-md border border-danger/40 bg-danger-tint px-5 text-md font-medium text-danger transition hover:bg-danger/10"
              >
                Force-advance to {nextPhase?.label} →
              </button>
            </form>
          ) : null}
        </section>
      </main>
    </div>
  );
}
