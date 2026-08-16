/**
 * /admin/build — Build-a-site workspace landing.
 *
 * Rewrite focuses on three things:
 *   1. No accent-tint backgrounds (banned anti-pattern). Hero is typography
 *      on plain surface with a single prominent button.
 *   2. Phases shown as a vertical numbered timeline, not a symmetric grid.
 *   3. Project list takes the page-base width with restrained density.
 */
import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteBuildProjects } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PHASE_LABEL: Record<string, string> = {
  brief: "Brief",
  research: "Research",
  dna: "Design DNA",
  sitemap: "Sitemap",
  pages: "Pages",
  review: "Review",
  deploy: "Ready to deploy",
  live: "Live",
  archived: "Archived",
};

const PHASE_TONE: Record<string, "info" | "warning" | "accent" | "success" | "neutral"> = {
  brief: "info",
  research: "info",
  dna: "warning",
  sitemap: "warning",
  pages: "warning",
  review: "accent",
  deploy: "accent",
  live: "success",
  archived: "neutral",
};

const PHASES = [
  { n: "01", t: "Brief",          d: "Six fields — business, city, services, content source, design direction." },
  { n: "02", t: "Global research", d: "Agent surveys 10+ top-performing sites in your niche worldwide." },
  { n: "03", t: "Design DNA",      d: "Unique palette, typography, voice. Distinct from at least 7 local competitors." },
  { n: "04", t: "Sitemap",         d: "Home · service pages · service-area pages · trust pages · blog seed." },
  { n: "05", t: "Pages",           d: "Each page generated with schema + AI-Overview-ready content + internal links." },
  { n: "06", t: "Quality review",  d: "Scored for AI Overview readiness · technical SEO · industry conventions." },
  { n: "07", t: "Deploy",          d: "Pushes to your Hostinger WordPress via the GYL Suite plugin. Schema injected." },
  { n: "08", t: "Post-publish QA", d: "Playwright tests every page across mobile / tablet / desktop / wide viewports." },
];

export default async function BuildIndexPage() {
  await ensureSchema();
  await requireAdmin();

  // Each project, enriched with cheaply-joinable signal the operator wants at a
  // glance: total pages + a status breakdown (published / ready / pending) and
  // the last job's status for the project. All correlated subqueries on indexed
  // columns — constant per-row cost.
  const projects = await db()
    .select({
      id: siteBuildProjects.id,
      businessName: siteBuildProjects.businessName,
      slug: siteBuildProjects.slug,
      city: siteBuildProjects.city,
      domain: siteBuildProjects.domain,
      phase: siteBuildProjects.phase,
      updatedAt: siteBuildProjects.updatedAt,
      pageTotal: sql<number>`(select count(*)::int from site_build_pages where site_build_pages.project_id = ${siteBuildProjects.id})`,
      pagePublished: sql<number>`(select count(*)::int from site_build_pages where site_build_pages.project_id = ${siteBuildProjects.id} and site_build_pages.status = 'published')`,
      pageReady: sql<number>`(select count(*)::int from site_build_pages where site_build_pages.project_id = ${siteBuildProjects.id} and site_build_pages.status in ('ready','edited'))`,
      pagePending: sql<number>`(select count(*)::int from site_build_pages where site_build_pages.project_id = ${siteBuildProjects.id} and site_build_pages.status in ('pending','generating'))`,
      pageFailed: sql<number>`(select count(*)::int from site_build_pages where site_build_pages.project_id = ${siteBuildProjects.id} and site_build_pages.status = 'failed')`,
      lastJobStatus: sql<string | null>`(select status from claude_jobs where claude_jobs.input->>'projectId' = ${siteBuildProjects.id}::text order by created_at desc limit 1)`,
    })
    .from(siteBuildProjects)
    .orderBy(desc(siteBuildProjects.updatedAt))
    .limit(40);

  // ── Network-wide roll-up for the summary strip ──
  const live = projects.filter((p) => p.phase === "live").length;
  const inProgress = projects.filter((p) => p.phase !== "live" && p.phase !== "archived").length;
  const totalPages = projects.reduce((a, p) => a + (p.pageTotal ?? 0), 0);
  const publishedPages = projects.reduce((a, p) => a + (p.pagePublished ?? 0), 0);
  const buildingNow = projects.filter(
    (p) => p.lastJobStatus === "running" || p.lastJobStatus === "claimed" || p.lastJobStatus === "pending",
  ).length;

  return (
    <div className="mx-auto max-w-[1080px] space-y-10">
      {/* ── Hero — typography lead, no decorative background ─────────────── */}
      <section className="space-y-5 pt-2">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-faint">
          Build a new website
        </p>
        <h1 className="max-w-[24ch] text-3xl font-medium tracking-tightish text-text">
          Research worldwide. Design uniquely. Publish to WordPress.
        </h1>
        <p className="max-w-[68ch] text-md text-text-muted">
          Tell the agent your domain, business, and city. It surveys top sites in your niche from{" "}
          <span className="text-text">NYC, LA, London, Paris, Dubai, Sydney, Singapore, Tokyo</span> — extracts
          what works, synthesizes a unique Design DNA, drafts every page with AI-Overview-optimized content +
          full schema markup, and deploys to your Hostinger WordPress when you approve.
        </p>
        <p className="max-w-[68ch] text-base text-text-faint">
          Runs on your Claude Code subscription via the Mac worker — $0 per-token cost on the heavy lifting.
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Link
            href="/admin/build/new"
            className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-md font-medium text-accent-fg shadow-xs transition hover:bg-accent-hover"
          >
            Build a new site
            <span className="ml-1.5 text-accent-fg/70">→</span>
          </Link>
          <span className="text-xs text-text-faint">
            Takes ~2-3 hours of agent work, mostly unattended.
          </span>
        </div>
      </section>

      {/* ── Summary strip — network-wide build signal over all projects ──── */}
      {projects.length > 0 ? (
        <StatStrip columns={4}>
          <Stat label="Projects" value={projects.length} suffix={live > 0 ? `${live} live` : undefined} />
          <Stat label="In progress" value={inProgress} tone={inProgress > 0 ? "info" : "neutral"} />
          <Stat
            label="Pages published"
            value={publishedPages}
            suffix={totalPages > 0 ? `/ ${totalPages}` : undefined}
            tone="success"
          />
          <Stat label="Building now" value={buildingNow} tone={buildingNow > 0 ? "accent" : "neutral"} live={buildingNow > 0} />
        </StatStrip>
      ) : null}

      {/* ── How it works — vertical numbered timeline (Linear pattern) ───── */}
      <section className="space-y-5">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-text">How the agent works</h2>
          <span className="text-xs text-text-faint">Eight phases · you approve each</span>
        </header>

        <ol className="relative">
          {/* Vertical guide rail */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden />

          {PHASES.map((p, i) => (
            <li key={p.n} className="relative grid grid-cols-[32px,1fr,minmax(0,42ch)] gap-x-5 py-3.5">
              <span className="tnum relative z-10 grid h-[30px] w-[30px] place-items-center rounded-md border border-border bg-bg text-xs font-medium text-text-muted">
                {p.n}
              </span>
              <span className="self-center text-md font-medium text-text">{p.t}</span>
              <span className="self-center text-base text-text-muted">{p.d}</span>
              {i < PHASES.length - 1 ? null : null}
            </li>
          ))}
        </ol>
      </section>

      {/* ── In progress — list (or empty state) ──────────────────────────── */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-text">In progress</h2>
          <span className="text-xs text-text-faint">
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </span>
        </header>

        {projects.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-5 py-8">
            <p className="text-md font-medium text-text">No projects yet</p>
            <p className="max-w-[52ch] text-base text-text-muted">
              Click <strong className="text-text">Build a new site</strong> above to start the first one.
              The agent queues a global research job immediately and walks you through the rest.
            </p>
          </div>
        ) : (
          <RowList footer={`${projects.length} project${projects.length === 1 ? "" : "s"}`}>
            {projects.map((p) => {
              const jobBusy =
                p.lastJobStatus === "running" || p.lastJobStatus === "claimed" || p.lastJobStatus === "pending";
              return (
                <Row key={p.id}>
                  <Link href={`/admin/build/${p.id}`} className="flex flex-1 items-center gap-3">
                    <Pill tone={PHASE_TONE[p.phase] ?? "neutral"}>{PHASE_LABEL[p.phase] ?? p.phase}</Pill>
                    <span className="text-base font-medium text-text">{p.businessName}</span>
                    {p.city ? <span className="text-xs text-text-faint">· {p.city}</span> : null}
                    {p.domain ? <span className="font-mono text-xs text-text-faint">· {p.domain}</span> : null}
                    <span className="flex-1" />
                    {/* Page breakdown — only render the segments that exist so the row
                        stays calm on early-phase projects with no pages yet. */}
                    {p.pageTotal > 0 ? (
                      <span className="hidden items-center gap-1.5 text-xs text-text-faint sm:flex">
                        <span className="tnum text-text-muted">{p.pageTotal} pages</span>
                        {p.pagePublished > 0 ? <span className="text-success">{p.pagePublished} live</span> : null}
                        {p.pageReady > 0 ? <span className="text-accent">{p.pageReady} ready</span> : null}
                        {p.pagePending > 0 ? <span>{p.pagePending} pending</span> : null}
                        {p.pageFailed > 0 ? <span className="text-danger">{p.pageFailed} failed</span> : null}
                      </span>
                    ) : null}
                    {jobBusy ? (
                      <span className="inline-flex items-center gap-1 text-xs text-info">
                        <span className="live-dot" aria-hidden /> {p.lastJobStatus}
                      </span>
                    ) : null}
                    <span className="text-xs text-text-faint">Updated {formatRelative(p.updatedAt)}</span>
                  </Link>
                </Row>
              );
            })}
          </RowList>
        )}
      </section>
    </div>
  );
}
