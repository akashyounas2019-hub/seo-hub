/**
 * A3 — Agent Jobs dashboard.
 *
 * Layout:
 *   1. AKS org-chart hero (leader row + delegates-to divider + 5 agents).
 *      Primary CTAs (New job / Assign to agent) live inside the leader row.
 *   2. Agent-team status cards — counts scoped to `kind='agent_task'` so they
 *      reflect the crew's real workload rather than every claude_jobs row.
 *   3. Recent jobs — 10 by default, with a View-all shortcut and a
 *      10/100/1000 per-page selector at the bottom.
 */
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites, users } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { isLLMConfigured } from "@/lib/llm";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { jobCost } from "@/lib/ai-pricing";
import { Pagination, type SearchParams } from "@/components/ui/Pagination";
import { AGENT_ROSTER, HERO_ROW_IDS, loadRoster } from "@/lib/agent-roster";
import { AGENT_CAPABILITIES, capabilityCount } from "@/lib/agent-capabilities";
import { deleteCustomAgentAction } from "@/app/actions/agent-profiles";
import { AgentHierarchyHero, type AgentActivityMap, type HierarchyAgent } from "./AgentHierarchyHero";
import { NeedsConfigTable, type NeedsConfigRow } from "./NeedsConfigTable";
import { PerPageSelector } from "./PerPageSelector";

export const dynamic = "force-dynamic";

/** Allowed per-page values for this screen. */
const PER_PAGE_OPTIONS = [10, 100, 1000] as const;
const DEFAULT_PER_PAGE = 10;

function parsePageParams(searchParams: SearchParams): { page: number; perPage: number } {
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const rawPer = Array.isArray(searchParams.perPage) ? searchParams.perPage[0] : searchParams.perPage;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const parsedPer = Number.parseInt(rawPer ?? "", 10);
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(parsedPer)
    ? parsedPer
    : DEFAULT_PER_PAGE;
  return { page, perPage };
}

export default async function AgentJobsPage({
  searchParams = {},
}: {
  searchParams?: SearchParams & { newSecret?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const { page, perPage } = parsePageParams(searchParams);

  const [jobsCountRow, recent] = await Promise.all([
    d.select({ n: sql<number>`count(*)::int` }).from(claudeJobs),
    d
      .select({
        j: claudeJobs,
        siteSlug: sites.slug,
        siteName: sites.name,
        authorEmail: users.email,
      })
      .from(claudeJobs)
      .leftJoin(sites, eq(sites.id, claudeJobs.siteId))
      .leftJoin(users, eq(users.id, claudeJobs.createdBy))
      .orderBy(desc(claudeJobs.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
  ]);
  const jobsTotal = jobsCountRow[0]?.n ?? 0;

  // ── Team-scoped status counts. `kind='agent_task'` is the row shape the
  // Assign-to-agent flow inserts, so these numbers describe what the crew is
  // actually doing, not every historical claude_jobs row.
  const teamPredicate = eq(claudeJobs.kind, "agent_task");
  const [teamCounts] = await d
    .select({
      pending: sql<number>`count(*) filter (where status='pending')::int`,
      claimed: sql<number>`count(*) filter (where status='claimed')::int`,
      running: sql<number>`count(*) filter (where status='running')::int`,
      done7d: sql<number>`count(*) filter (where status='done' and ${claudeJobs.createdAt} >= now() - interval '7 days')::int`,
      failed7d: sql<number>`count(*) filter (where status='failed' and ${claudeJobs.createdAt} >= now() - interval '7 days')::int`,
    })
    .from(claudeJobs)
    .where(teamPredicate);

  // ── Per-agent activity — queued/running/done7d grouped by input->>'agentId'.
  const perAgentRows = await d
    .select({
      agentId: sql<string>`(${claudeJobs.input}->>'agentId')`,
      queued: sql<number>`count(*) filter (where status='pending')::int`,
      running: sql<number>`count(*) filter (where status in ('claimed','running'))::int`,
      done7d: sql<number>`count(*) filter (where status='done' and ${claudeJobs.createdAt} >= now() - interval '7 days')::int`,
    })
    .from(claudeJobs)
    .where(and(teamPredicate, sql`${claudeJobs.input} ? 'agentId'`))
    .groupBy(sql`(${claudeJobs.input}->>'agentId')`);

  const activityByAgent: AgentActivityMap = {};
  for (const a of AGENT_ROSTER) activityByAgent[a.id] = { queued: 0, running: 0, done7d: 0 };
  for (const row of perAgentRows) {
    if (!row.agentId) continue;
    activityByAgent[row.agentId] = {
      queued: row.queued ?? 0,
      running: row.running ?? 0,
      done7d: row.done7d ?? 0,
    };
  }

  const totalActive = (teamCounts?.claimed ?? 0) + (teamCounts?.running ?? 0);
  const totalQueued = teamCounts?.pending ?? 0;

  const llmConfigured = await isLLMConfigured();
  const serverExecutorActive = llmConfigured && process.env.CLAUDE_EXECUTOR_DISABLED !== "1";

  const showingLimit = Math.min(perPage, 10);
  const showingViewAll = perPage === DEFAULT_PER_PAGE && jobsTotal > DEFAULT_PER_PAGE;

  // ── Roster (built-ins + custom agents, with skill_instructions) ──
  const roster = await loadRoster();
  const leaderRow = roster.find((r) => r.id === "leader");
  // Candidate hero row = HERO_ROW_IDS order + any custom agents. Off-page is
  // NOT in HERO_ROW_IDS by design; if its config is complete it flows into the
  // hero anyway via the extra candidates below, otherwise it lands in the
  // 'Needs configuration' review table.
  const heroIndex = new Map(HERO_ROW_IDS.map((id, i) => [id as string, i]));
  const candidateExpertRows = [
    ...HERO_ROW_IDS
      .map((id) => roster.find((r) => r.id === id))
      .filter((r): r is (typeof roster)[number] => !!r),
    ...roster.filter((r) => r.id !== "leader" && !heroIndex.has(r.id)),
  ];

  // "Configured" = active AND has skill instructions AND has ≥ 1 wired
  // capability. Anything failing is quarantined into a review table below.
  interface UnconfiguredReason { off: boolean; noSkills: boolean; noCapabilities: boolean }
  const unconfiguredReasons = new Map<string, UnconfiguredReason>();
  const isConfigured = (r: (typeof roster)[number]): boolean => {
    const off = !r.isActive;
    const noSkills = !(r.skillInstructions ?? "").trim();
    const noCapabilities = capabilityCount(r.id) === 0;
    const ok = !off && !noSkills && !noCapabilities;
    if (!ok) unconfiguredReasons.set(r.id, { off, noSkills, noCapabilities });
    return ok;
  };
  const expertRows = candidateExpertRows.filter(isConfigured);
  const unconfiguredRows = candidateExpertRows.filter((r) => !isConfigured(r));

  const toHierarchy = (r: (typeof roster)[number]): HierarchyAgent => ({
    id: r.id,
    name: r.name,
    title: r.title,
    focus: r.focus,
    isCustom: !!r.isCustom,
    isActive: r.isActive,
    skillInstructions: r.skillInstructions ?? null,
    capabilities: (AGENT_CAPABILITIES as Record<string, { label: string; href?: string; backend?: string; hint?: string }[]>)[r.id] ?? [],
  });

  return (
    <div className="space-y-6">
      {/* 1) Org-chart hero — only fully-configured agents render here. */}
      {leaderRow ? (
        <AgentHierarchyHero
          leader={toHierarchy(leaderRow)}
          experts={expertRows.map(toHierarchy)}
          activityByAgent={activityByAgent}
          totalActive={totalActive}
          totalQueued={totalQueued}
          deleteAgentAction={deleteCustomAgentAction}
        />
      ) : null}

      {/* 1b) Anything not fully configured lands here with reason chips. */}
      <NeedsConfigTable
        rows={unconfiguredRows.map((r): NeedsConfigRow => {
          const reason = unconfiguredReasons.get(r.id) ?? { off: false, noSkills: false, noCapabilities: false };
          return {
            id: r.id,
            name: r.name,
            title: r.title,
            focus: r.focus,
            isCustom: !!r.isCustom,
            off: reason.off,
            noSkills: reason.noSkills,
            noCapabilities: reason.noCapabilities,
          };
        })}
      />

      {searchParams.newSecret ? (
        <div className="rounded-md border border-success/30 bg-success-tint p-3 text-xs">
          <p className="font-medium text-text">New worker secret generated. Save it — you won&apos;t see it again:</p>
          <code className="mt-2 block break-all rounded bg-surface px-2 py-1.5 font-mono text-xs text-text">{searchParams.newSecret}</code>
        </div>
      ) : null}

      {searchParams.ok === "agent-created" ? (
        <div className="rounded-md border border-success/30 bg-success-tint p-3 text-xs text-success">
          <p className="font-medium text-text">
            {typeof searchParams.name === "string" ? `${searchParams.name} joined the crew.` : "Custom agent created."}
          </p>
          <p className="mt-0.5 text-text-muted">They appear on the hero below and can be assigned tasks from /admin/agent/tasks/new.</p>
        </div>
      ) : null}

      {searchParams.ok === "agent-deleted" ? (
        <div className="rounded-md border border-success/30 bg-success-tint p-3 text-xs text-success">
          <p className="font-medium text-text">Custom agent deleted.</p>
        </div>
      ) : null}

      {serverExecutorActive ? (
        <section className="rounded-xl border border-success/30 bg-success-tint/30 p-4">
          <div className="flex items-start gap-3">
            <span className="live-dot mt-1.5" aria-hidden />
            <div className="flex-1">
              <h2 className="text-sm font-medium text-text">Auto-runner active</h2>
              <p className="mt-1 text-xs text-text-muted">
                Jobs the team queues are picked up by the server every 30 seconds and run with your Anthropic key.
                Cost is logged per job in <span className="font-mono">ai_usage</span> — typically $0.20–$1.50 per audit.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* 2) Team-scoped status cards */}
      <section aria-label="Agent team activity" className="grid gap-3 sm:grid-cols-5">
        <Kpi label="Queued" value={teamCounts?.pending ?? 0} tone="info" />
        <Kpi label="Claimed" value={teamCounts?.claimed ?? 0} tone="info" />
        <Kpi label="Running" value={teamCounts?.running ?? 0} tone="warning" />
        <Kpi label="Done (7d)" value={teamCounts?.done7d ?? 0} tone="success" />
        <Kpi label="Failed (7d)" value={teamCounts?.failed7d ?? 0} tone="danger" />
      </section>

      {/* 3) Recent jobs */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text">Recent jobs</h2>
            <p className="mt-0.5 text-[11px] text-text-muted">
              Showing the most recent {Math.min(recent.length, showingLimit)} of {jobsTotal} — newest first.
            </p>
          </div>
          {showingViewAll ? (
            <Link
              href="/admin/agent/jobs?perPage=100"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-text hover:border-accent"
            >
              View all →
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
            <p className="font-medium text-text">No jobs yet.</p>
            <p className="mt-1">
              Click <strong>+ New job</strong> in the leader row above to send the first task to Claude Code.
            </p>
          </div>
        ) : (
          <RowList footer={`${jobsTotal} job${jobsTotal === 1 ? "" : "s"}`}>
            {recent.map((row) => {
              const j = row.j;
              const tone =
                j.status === "done"
                  ? "success"
                  : j.status === "failed"
                    ? "danger"
                    : j.status === "running" || j.status === "claimed"
                      ? "info"
                      : j.status === "cancelled"
                        ? "neutral"
                        : "warning";
              const cost = jobCost({
                preferWorker: j.preferWorker,
                workerId: j.workerId,
                tokensInput: j.tokensInput,
                tokensOutput: j.tokensOutput,
              });
              return (
                <Row key={j.id}>
                  <Link href={`/admin/agent/jobs/${j.id}`} className="flex flex-1 items-center gap-3">
                    <Pill tone={tone}>{j.status}</Pill>
                    <Pill tone="neutral">{j.kind}</Pill>
                    <span className="flex-1 truncate text-xs text-text">{j.title}</span>
                    {row.siteName ? <span className="text-xs text-text-faint">{row.siteName}</span> : null}
                    <span
                      className={`shrink-0 font-mono text-xs ${cost.engine === "mac" ? "text-success" : "text-text-faint"}`}
                      title={cost.engine === "mac" ? "Ran on Mac worker — covered by Claude Code subscription" : cost.engine === "server" ? "Ran on server executor — Anthropic API per-token cost" : "Engine unknown"}
                    >
                      {cost.label}
                    </span>
                    <span className="shrink-0 text-xs text-text-faint">{formatRelative(j.createdAt)}</span>
                  </Link>
                </Row>
              );
            })}
          </RowList>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <PerPageSelector
            current={perPage}
            options={PER_PAGE_OPTIONS as unknown as number[]}
            searchParams={searchParams}
          />
          <Pagination
            basePath="/admin/agent/jobs"
            page={page}
            totalItems={jobsTotal}
            perPage={perPage}
            searchParams={searchParams}
          />
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "danger" | "info" }) {
  const color =
    tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : tone === "info" ? "text-info" : "text-text";
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border px-4 py-3"
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--border-strong), transparent)" }}
      />
      <p className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums leading-none tracking-tight ${color}`}>{value}</p>
    </div>
  );
}
