import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  aiUsage,
  apiKeys,
  events,
  integrationsAccounts,
  leads,
  seoActions,
  seoPolicies,
  sites,
  siteUsers,
  tasks,
  trafficSnapshots,
  users,
} from "@/db/schema";
import {
  deleteSiteAction,
  revokeApiKeyAction,
  rotateApiKeyAction,
  updateSiteAction,
  updateSiteKnowledgeAction,
} from "@/app/actions/sites";
import { updateGa4PropertyIdAction } from "@/app/actions/settings";
import { syncGa4NowAction, syncGscNowAction } from "@/app/actions/sync";
import { assignSiteAction, unassignSiteAction } from "@/app/actions/users";
import { AgentPanel } from "@/components/ui/AgentPanel";
import { SiteTabs } from "./SiteTabs";
import { Pill, Row as RowItem, RowList, StatusDot } from "@/components/ui/Row";
import { ScoreGrid } from "@/components/ui/ScoreRing";
import { Stat as KpiStat, StatStrip } from "@/components/ui/Stat";
import { formatMicroUsd } from "@/lib/ai-pricing";
import { getScoresWithTrend } from "@/lib/scoring";
import { requireAdmin } from "@/lib/server-auth";
import { cn, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { ok?: string; error?: string; newKey?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const [site] = await d.select().from(sites).where(eq(sites.slug, params.slug)).limit(1);
  if (!site) notFound();

  const keys = await d
    .select({
      id: apiKeys.id,
      keyId: apiKeys.keyId,
      secret: apiKeys.secret,
      active: apiKeys.active,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.siteId, site.id))
    .orderBy(desc(apiKeys.createdAt));

  const newestActive = keys.find((k) => k.active);

  const team = await d
    .select({
      userId: siteUsers.userId,
      role: siteUsers.role,
      email: users.email,
      name: users.name,
      userRole: users.role,
    })
    .from(siteUsers)
    .innerJoin(users, eq(users.id, siteUsers.userId))
    .where(eq(siteUsers.siteId, site.id))
    .orderBy(users.email);

  const [counts] = await d
    .select({
      leadCount: sql<number>`(select count(*)::int from leads where leads.site_id = ${site.id})`,
      newLeadCount: sql<number>`(select count(*)::int from leads where leads.site_id = ${site.id} and leads.status = 'new')`,
    })
    .from(sites)
    .where(eq(sites.id, site.id))
    .limit(1);

  const recentLeads = await d
    .select({
      id: leads.id,
      form: leads.form,
      name: leads.name,
      email: leads.email,
      createdAt: leads.createdAt,
      status: leads.status,
    })
    .from(leads)
    .where(eq(leads.siteId, site.id))
    .orderBy(desc(leads.createdAt))
    .limit(10);

  // Tasks for this site — include assignee name/email via left join so we can
  // render avatar chips that link to the user page. Sorted by status group
  // (open first), then priority, then due date so the most actionable items
  // surface at the top.
  const allTasks = await d
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      assigneeId: tasks.assigneeId,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(eq(tasks.siteId, site.id))
    .orderBy(
      // Open work first, then closed. (Sorting open tasks ahead of done/cancelled
      // means the most actionable items always appear at the top of the panel.)
      sql`case ${tasks.status}
        when 'in_progress' then 0
        when 'todo' then 1
        when 'in_review' then 2
        when 'blocked' then 3
        when 'done' then 4
        when 'cancelled' then 5
        else 6 end`,
      sql`case ${tasks.priority}
        when 'urgent' then 0
        when 'high' then 1
        when 'normal' then 2
        when 'low' then 3
        else 4 end`,
      sql`case when ${tasks.dueAt} is null then 1 else 0 end`,
      tasks.dueAt,
    )
    .limit(50);

  // Normalize timestamps from the join (Postgres returns them as strings
  // when they're aliased through a complex query).
  const sitetasks = allTasks.map((t) => ({
    ...t,
    dueAt: t.dueAt ? (t.dueAt instanceof Date ? t.dueAt : new Date(t.dueAt as unknown as string)) : null,
    completedAt: t.completedAt
      ? (t.completedAt instanceof Date ? t.completedAt : new Date(t.completedAt as unknown as string))
      : null,
  }));

  const openTasksCount = sitetasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
  const overdueCount = sitetasks.filter(
    (t) => t.dueAt && t.dueAt.getTime() < Date.now() && t.status !== "done" && t.status !== "cancelled",
  ).length;
  const unassignedCount = sitetasks.filter(
    (t) => !t.assigneeId && t.status !== "done" && t.status !== "cancelled",
  ).length;

  // Phase 4 + 5 sections
  const integrations = await d
    .select()
    .from(integrationsAccounts)
    .where(eq(integrationsAccounts.siteId, site.id));
  const trafficRows = await d
    .select()
    .from(trafficSnapshots)
    .where(eq(trafficSnapshots.siteId, site.id))
    .orderBy(desc(trafficSnapshots.snapshotDate))
    .limit(14);
  const googleConnected = integrations.find((i) => i.provider === "google");

  // ── WordPress plugin heartbeat ──
  //
  // The GYL WP plugin proves it's alive in two ways:
  //   1. It calls signed endpoints, which stamps `api_keys.last_used_at`.
  //   2. It POSTs to the ingest endpoint, which inserts an `events` row.
  //
  // We treat the site as "Connected" when there's at least one active key AND
  // either a signal in the last 24h. Older than 24h → "Idle". No signal at
  // all → "Not connected" (the operator needs to install the plugin).
  const activeKey = keys.find((k) => k.active) ?? null;
  const [latestEventRow] = await d
    .select({ receivedAt: events.receivedAt })
    .from(events)
    .where(eq(events.siteId, site.id))
    .orderBy(desc(events.receivedAt))
    .limit(1);
  const lastPluginSignalAt =
    [activeKey?.lastUsedAt ?? null, latestEventRow?.receivedAt ?? null]
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const wpConnection = {
    hasKey: !!activeKey,
    lastSignalAt: lastPluginSignalAt,
    // Alive if a signal landed in the last 24h.
    isLive:
      !!lastPluginSignalAt && Date.now() - lastPluginSignalAt.getTime() < 24 * 60 * 60_000,
  };

  // ── Agent-panel context (per-site policy + cost + recent activity) ──
  const [policyRow] = await d.select().from(seoPolicies).where(eq(seoPolicies.siteId, site.id)).limit(1);
  const policyCaps = policyRow?.capabilities ?? {};
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [costRow] = await d
    .select({ cost: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::bigint` })
    .from(aiUsage)
    .where(and(eq(aiUsage.siteId, site.id), gte(aiUsage.createdAt, monthStart)));
  const recentAgentActivity = await d
    .select({
      id: seoActions.id,
      kind: seoActions.kind,
      createdAt: seoActions.createdAt,
      success: seoActions.success,
      pluginResponse: seoActions.pluginResponse,
      errorMessage: seoActions.errorMessage,
    })
    .from(seoActions)
    .where(eq(seoActions.siteId, site.id))
    .orderBy(desc(seoActions.createdAt))
    .limit(8);
  // P1 — Site composite scores with WoW trend
  const siteScoresWithTrend = await getScoresWithTrend(site.id);
  const hasAnySiteScore = siteScoresWithTrend.some((s) => s.current !== null);

  // ── Hub badge counts — one cheap aggregate query covering every sub-page the
  // operator can drill into. Surfacing these as count badges turns the detail
  // page into a real navigation hub instead of a dead-end form. ──
  const [hub] = await d
    .select({
      pagesTotal: sql<number>`(select count(*)::int from site_pages where site_pages.site_id = ${site.id})`,
      indexTracked: sql<number>`(select count(*)::int from indexing_status where indexing_status.site_id = ${site.id})`,
      indexIndexed: sql<number>`(select count(*)::int from indexing_status where indexing_status.site_id = ${site.id} and index_state = 'indexed')`,
      openFixes: sql<number>`(select count(*)::int from fix_proposals where fix_proposals.site_id = ${site.id} and status = 'pending')`,
      ranksTracked: sql<number>`(select count(*)::int from tracked_keywords where tracked_keywords.site_id = ${site.id} and enabled = true)`,
      localAudits: sql<number>`(select count(*)::int from local_seo_rubric_audits where local_seo_rubric_audits.site_id = ${site.id})`,
      healthRed: sql<number>`(select count(*)::int from page_health_issues where page_health_issues.site_id = ${site.id} and severity = 'red')`,
    })
    .from(sites)
    .where(eq(sites.id, site.id))
    .limit(1);
  const seoScore = siteScoresWithTrend.find((s) => s.key === "seo")?.current ?? null;

  const agentPanelCapabilities = [
    { key: "alt_text",         label: "Alt text fixes",          description: "Generate alt for images that have none." },
    { key: "meta_title",       label: "Meta titles",             description: "Rewrite titles out of the 30-60 char range." },
    { key: "meta_description", label: "Meta descriptions",       description: "Add or rewrite to 140-160 char target." },
    { key: "schema_inject",    label: "Schema injection",        description: "Add missing JSON-LD blocks." },
    { key: "visual_css",       label: "Visual & UX changes",     description: "Always proposal — never auto-applied.", locked: true },
  ].map((c) => ({
    ...c,
    mode: ((policyCaps as Record<string, string>)[c.key] as "auto" | "propose" | "off") ?? (c.key === "visual_css" ? "propose" : "auto"),
  }));

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/sites"
          className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text"
        >
          ← Sites
        </Link>
        <h1 className="">
          {site.name}
        </h1>
        <p className="mt-1.5 font-mono text-xs text-text-muted">
          <span className="text-text">{site.slug}</span> · {site.domain} · {site.city ?? "—"}
          {site.region ? `, ${site.region}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs">
          <AgentPanel
            siteId={site.id}
            siteSlug={site.slug}
            siteName={site.name}
            capabilities={agentPanelCapabilities}
            costThisMonth={formatMicroUsd(Number(costRow?.cost ?? 0))}
            recentActivity={recentAgentActivity.map((a) => ({
              id: a.id,
              kind: a.kind,
              summary: a.success
                ? (typeof (a.pluginResponse as Record<string, unknown>)?.message === "string"
                    ? String((a.pluginResponse as Record<string, unknown>).message)
                    : "Applied successfully")
                : (a.errorMessage ?? "Failed"),
              at: a.createdAt.toISOString(),
              success: a.success,
            }))}
          />
        </div>
      </header>

      <SiteTabs slug={site.slug} />

      {searchParams.ok ? (
        <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-xs text-success">
          {flashMsg(searchParams.ok)}
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="flex items-start gap-3 rounded-lg border-2 border-danger/50 bg-danger-tint/60 p-4 text-sm text-danger shadow-[0_4px_20px_-8px_rgba(220,38,38,0.3)]">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-0.5 h-5 w-5 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
          <div className="min-w-0">
            <p className="font-medium">Action didn&apos;t complete</p>
            <p className="mt-0.5 text-danger/90">{flashMsg(searchParams.error)}</p>
          </div>
        </div>
      ) : null}

      {/* ---------- Composite scores (P1) ---------- */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="">
              Composite scores
            </h2>
            <p className="text-xs text-text-faint">
              Six dimensions, 0–100. Updated daily. Trend = vs. 7 days ago.
            </p>
          </div>
        </div>
        {hasAnySiteScore ? (
          <ScoreGrid scores={siteScoresWithTrend} siteSlug={site.slug} size="md" />
        ) : (
          <p className="rounded-md border border-dashed border-border bg-surface-soft px-3 py-3 text-xs text-text-faint">
            No score data for this site yet. Once the daily scoring job runs, this panel populates automatically.
          </p>
        )}
      </section>

      <StatStrip columns={4}>
        <KpiStat
          label="SEO score"
          value={seoScore ?? "—"}
          suffix={seoScore !== null ? "/ 100" : undefined}
          tone={seoScore === null ? "neutral" : seoScore >= 75 ? "success" : seoScore >= 50 ? "accent" : seoScore >= 25 ? "warning" : "danger"}
        />
        <KpiStat
          label="Pages indexed"
          value={hub.indexTracked > 0 ? `${Math.round((hub.indexIndexed / hub.indexTracked) * 100)}%` : (hub.pagesTotal || "—")}
          suffix={hub.indexTracked > 0 ? `${hub.indexIndexed}/${hub.indexTracked}` : hub.pagesTotal > 0 ? "in catalogue" : undefined}
        />
        <KpiStat
          label="New leads"
          value={counts.newLeadCount}
          suffix={`/ ${counts.leadCount} total`}
          tone={counts.newLeadCount > 0 ? "info" : "neutral"}
        />
        <KpiStat
          label="Open fixes"
          value={hub.openFixes}
          href={`/admin/sites/${site.slug}/fixes`}
          tone={hub.openFixes > 0 ? "warning" : "neutral"}
        />
      </StatStrip>

      {/* ── Hub quick-links — every per-site sub-page with a live count badge,
            so the detail page is a true navigation hub, not a dead-end. ── */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <HubLink href={`/admin/sites/${site.slug}/health`} label="Health" badge={hub.healthRed > 0 ? `${hub.healthRed} red` : "ok"} tone={hub.healthRed > 0 ? "danger" : "neutral"} />
        <HubLink href={`/admin/sites/${site.slug}/local`} label="Local SEO" badge={hub.localAudits > 0 ? String(hub.localAudits) : "—"} />
        <HubLink href={`/admin/sites/${site.slug}/ranks`} label="Ranks" badge={hub.ranksTracked > 0 ? String(hub.ranksTracked) : "—"} />
        <HubLink href={`/admin/sites/${site.slug}/pages`} label="Pages" badge={hub.pagesTotal > 0 ? String(hub.pagesTotal) : "—"} />
        <HubLink href={`/admin/sites/${site.slug}/fixes`} label="Fixes" badge={hub.openFixes > 0 ? String(hub.openFixes) : "0"} tone={hub.openFixes > 0 ? "warning" : "neutral"} />
        <HubLink href={`/admin/sites/${site.slug}/screenshots`} label="Screenshots" badge="open" />
      </section>

      {newestActive && searchParams.newKey ? (
        <section className="rounded-md border border-warning/30 bg-warning-tint p-5">
          <h2 className="text-sm font-semibold text-warning">
            New API key — save it now, this is the only time the secret is highlighted
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 font-mono text-xs text-warning">
            <div>
              <span className="text-warning/70">GYL_KEY_ID =</span> {newestActive.keyId}
            </div>
            <div className="break-all">
              <span className="text-warning/70">GYL_SECRET =</span> {newestActive.secret}
            </div>
          </div>
          <p className="mt-3 text-xs text-warning/80">
            Paste these into the GYL Connect WP plugin settings on{" "}
            <code className="rounded bg-warning-tint px-1 py-0.5">{site.domain}</code>.
          </p>
        </section>
      ) : null}

      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
          Site profile
        </h2>
        <form action={updateSiteAction.bind(null, site.slug)} className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" defaultValue={site.name} required />
          <Field label="Domain" name="domain" defaultValue={site.domain} required />
          <Field label="City" name="city" defaultValue={site.city ?? ""} />
          <Field label="Region" name="region" defaultValue={site.region ?? ""} />
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-brand-navy-deep shadow-xs hover:bg-accent-hover"
            >
              Save
            </button>
          </div>
        </form>
      </section>

      {/*
        AI knowledge base — freeform text the chat / voice assistant uses to
        answer customer questions about THIS site. Anything pasted here is
        injected verbatim into the LLM system prompt. Capped at 8 KB so the
        token budget stays sane.
      */}
      <section className="rounded-md border border-border bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
              AI assistant knowledge
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Paste plain-text facts about this site — service area, services, policies, hours, FAQs. The chat
              widget and voice booking assistant read this verbatim and use it to answer customer questions.
            </p>
          </div>
          <span className="text-xs text-text-faint">
            {site.knowledgeBase?.length ?? 0} / 8192 chars
          </span>
        </div>
        <form action={updateSiteKnowledgeAction.bind(null, site.slug)} className="mt-3 space-y-3">
          <textarea
            name="knowledge_base"
            rows={14}
            maxLength={8192}
            defaultValue={site.knowledgeBase ?? ""}
            placeholder={`SERVICE AREA: Dubai + all UAE emirates. Sharjah, Abu Dhabi, Ajman on request.

SERVICES:
- Standard cleaning: same-day availability across Dubai
- Villa deep clean: 60-point audited checklist, half or full-day
- Move-in / move-out cleaning: handover-grade, expanded checklist
- Post-construction cleaning: dust, paint residue, final handover
- Sofa / carpet / curtain / mattress cleaning: on-site steam or wet-clean
- Office cleaning: after-hours, contract or one-off

HOURS: Sun-Thu 8am-8pm, Fri-Sat 9am-6pm. WhatsApp dispatch 8am-10pm daily.

POLICIES:
- Free cancellation up to 24 hours before the appointment
- Fixed AED price returned the same working day — no hidden fees, VAT included
- Licensed by Dubai Municipality; team members background-checked
- Every clean is audited against the written 60-point checklist before the team leaves
- Bilingual support: English + Arabic
- Recurring customers can skip, pause, or reschedule any visit with 24 hours' notice

AREAS SERVED (Dubai neighbourhoods):
- Palm Jumeirah, Emirates Hills, Dubai Marina, Downtown Dubai, DIFC, JBR
- Business Bay, Jumeirah, Al Barsha, Dubai Hills, Arabian Ranches, JVC
- Silicon Oasis, Meadows, The Springs, Damac Hills, Mirdif, Al Furjan, Motor City

FAQs:
- Team arrival: on-time to the booked slot; team leads message on WhatsApp when 15 min out
- Same-day service: quote comes back within the same working day; execution as soon as next-day for most communities`}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-faint">
              Tip: write the way you would brief a new dispatcher — full sentences are fine, lists too. The AI
              treats this as ground truth, so anything ambiguous here can become a customer misquote.
            </p>
            <button
              type="submit"
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep shadow-xs hover:bg-accent-hover"
            >
              Save knowledge
            </button>
          </div>
        </form>
      </section>

      <section id="api-keys" className="rounded-md border border-border bg-surface p-5 scroll-mt-20">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            API keys
          </h2>
          <form action={rotateApiKeyAction.bind(null, site.slug)}>
            <button
              type="submit"
              className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
            >
              Rotate (issue new + deactivate old)
            </button>
          </form>
        </div>
        <div className="-mx-3 sm:mx-0 mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-text-faint">
            <tr>
              <th className="px-2 py-1.5">Key ID</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Last used</th>
              <th className="px-2 py-1.5">Created</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-border">
                <td className="px-2 py-2 font-mono text-xs">{k.keyId}</td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ring-inset ${
                      k.active
                        ? "bg-success-tint text-success ring-success/30"
                        : "bg-surface-2 text-text-faint ring-border"
                    }`}
                  >
                    {k.active ? "active" : "revoked"}
                  </span>
                </td>
                <td className="px-2 py-2 text-xs text-text-muted">
                  {k.lastUsedAt ? formatRelative(k.lastUsedAt) : <span className="text-text-faint">never</span>}
                </td>
                <td className="px-2 py-2 text-xs text-text-muted">{formatRelative(k.createdAt)}</td>
                <td className="px-2 py-2 text-right">
                  {k.active ? (
                    <form action={revokeApiKeyAction.bind(null, site.slug)}>
                      <input type="hidden" name="keyId" value={k.keyId} />
                      <button type="submit" className="text-xs text-danger hover:underline">
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
          Team ({team.length})
        </h2>
        {team.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No one assigned yet.</p>
        ) : (
          <div className="-mx-3 sm:mx-0 mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-text-faint">
              <tr>
                <th className="px-2 py-1.5">Email</th>
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5">Global role</th>
                <th className="px-2 py-1.5">Role here</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.userId} className="border-t border-border">
                  <td className="px-2 py-2 font-mono text-xs">
                    <Link href={`/admin/users/${m.userId}`} className="text-accent hover:underline">
                      {m.email}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{m.name ?? <span className="text-text-faint">—</span>}</td>
                  <td className="px-2 py-2 font-mono text-xs">{m.userRole}</td>
                  <td className="px-2 py-2 font-mono text-xs">{m.role}</td>
                  <td className="px-2 py-2 text-right">
                    <form action={unassignSiteAction.bind(null, m.userId)}>
                      <input type="hidden" name="siteId" value={site.id} />
                      <button type="submit" className="text-xs text-danger hover:underline">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <UnassignedUserPicker siteId={site.id} />
      </section>

      <section className="rounded-md border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            Recent leads
          </h2>
          <Link href={`/admin/leads`} className="text-xs text-accent hover:underline">
            View all →
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No leads yet for this site.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {recentLeads.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <Link href={`/admin/leads/${l.id}`} className="hover:underline">
                    {l.name ?? l.email ?? "—"}
                  </Link>{" "}
                  <span className="font-mono text-xs text-text-faint">{l.form}</span>
                </div>
                <div className="text-xs text-text-faint">{formatRelative(l.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-text">Tasks</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Assigned work for this site. Drag-and-drop kanban view at{" "}
              <Link href={`/admin/tasks?site=${site.slug}`} className="font-medium text-accent hover:underline">
                /admin/tasks?site={site.slug}
              </Link>
              .
            </p>
          </div>
          <Link
            href={`/admin/tasks/new?site=${site.slug}`}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-brand-navy-deep shadow-sm hover:bg-accent-hover focus-visible:shadow-glow"
          >
            + New task
          </Link>
        </div>

        {/* Mini summary strip — counts that drive the next action */}
        <div className="grid grid-cols-3 gap-px bg-border/40">
          <div className="bg-surface px-4 py-3 text-center">
            <div className="text-xl font-semibold tabular-nums text-text">{openTasksCount}</div>
            <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint">Open</div>
          </div>
          <div className={`bg-surface px-4 py-3 text-center ${overdueCount > 0 ? "" : ""}`}>
            <div className={`text-xl font-semibold tabular-nums ${overdueCount > 0 ? "text-danger" : "text-text"}`}>
              {overdueCount}
            </div>
            <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint">Overdue</div>
          </div>
          <div className="bg-surface px-4 py-3 text-center">
            <div className={`text-xl font-semibold tabular-nums ${unassignedCount > 0 ? "text-warning" : "text-text"}`}>
              {unassignedCount}
            </div>
            <div className="mt-0.5 text-xs uppercase tracking-wide text-text-faint">Unassigned</div>
          </div>
        </div>

        {/* Task list */}
        {sitetasks.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-text-muted">No tasks for this site yet.</p>
            <Link
              href={`/admin/tasks/new?site=${site.slug}`}
              className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
            >
              Create the first task &rarr;
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sitetasks.slice(0, 12).map((t) => (
              <SiteTaskRow key={t.id} task={t} />
            ))}
            {sitetasks.length > 12 ? (
              <li className="px-5 py-3 text-center text-xs text-text-faint">
                Showing 12 of {sitetasks.length} tasks ·{" "}
                <Link href={`/admin/tasks?site=${site.slug}`} className="font-medium text-accent hover:underline">
                  View all
                </Link>
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
          Integrations
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Connect the WordPress site and Google to capture leads and pull traffic data.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <WordPressCard connection={wpConnection} />
          <IntegrationCard
            label="Google (GSC + GA4)"
            siteSlug={site.slug}
            provider="google"
            account={googleConnected}
            note={
              googleConnected
                ? "Connected — Search Console + Analytics 4"
                : "Search Console + Analytics 4 read-only"
            }
          />
        </div>
        {!googleConnected ? (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning-tint/40 p-3 text-xs text-text-muted">
            <p className="font-medium text-text">
              Google isn&apos;t connected on this site yet.
            </p>
            <p className="mt-1">
              You need to click <strong>Connect</strong> on the Google card above and complete the OAuth
              consent screen. Only after that will the GA4 property field and the Sync GSC / Sync GA4
              buttons appear here.
            </p>
          </div>
        ) : null}
        {googleConnected ? (
          <>
            <form
              action={async (fd: FormData) => {
                "use server";
                const pid = String(fd.get("ga4_property_id") ?? "");
                await updateGa4PropertyIdAction(site.id, pid);
              }}
              className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-2 p-3"
            >
              <label className="block flex-1">
                <span className="block text-xs uppercase tracking-wide text-text-faint">
                  GA4 property_id (e.g. 312345678 or properties/312345678)
                </span>
                <input
                  name="ga4_property_id"
                  type="text"
                  autoComplete="off"
                  defaultValue={String((googleConnected.metadata as { ga4_property_id?: string } | null)?.ga4_property_id ?? "")}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
              >
                Save GA4 property
              </button>
            </form>

            {/* Manual sync — pulls last 28d into traffic_snapshots on demand. */}
            <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
                    Sync now
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Pulls the last 28 days from Google into <span className="font-mono">traffic_snapshots</span>. Daily crons run at 04:00 / 04:10 UTC.
                  </p>
                </div>
                {googleConnected.lastSyncAt ? (
                  <p className="text-[11px] text-text-faint">
                    Last sync: {formatRelative(googleConnected.lastSyncAt)}
                    {googleConnected.lastSyncStatus === "error" ? (
                      <span className="ml-1 text-danger">· {googleConnected.lastSyncError ?? "error"}</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={syncGscNowAction}>
                  <input type="hidden" name="siteId" value={site.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
                  >
                    Sync GSC now
                  </button>
                </form>
                <form action={syncGa4NowAction}>
                  <input type="hidden" name="siteId" value={site.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
                  >
                    Sync GA4 now
                  </button>
                </form>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {trafficRows.length > 0 ? (
        <section className="rounded-md border border-border bg-surface p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
            SEO / traffic (last 14 days)
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-text-faint">
              <tr>
                <th className="px-2 py-1.5">Date</th>
                <th className="px-2 py-1.5">Source</th>
                <th className="px-2 py-1.5">Metrics</th>
              </tr>
            </thead>
            <tbody>
              {trafficRows.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-2 py-2 font-mono text-xs">{t.snapshotDate}</td>
                  <td className="px-2 py-2">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                      {t.source}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs text-text-muted">
                    {JSON.stringify(t.metrics)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="rounded-md border border-danger/30 bg-danger-tint p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-danger">
          Danger zone
        </h2>
        <p className="mt-2 text-sm text-danger/80">
          Delete this site and all its leads, events, API keys, and team assignments. The WP plugin
          will fail to ingest until reconfigured.
        </p>
        <form action={deleteSiteAction.bind(null, site.slug)} className="mt-3">
          <button
            type="submit"
            className="rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-tint"
          >
            Delete site
          </button>
        </form>
      </section>
    </div>
  );
}

async function UnassignedUserPicker({ siteId }: { siteId: string }) {
  const d = db();
  const candidates = await d
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(
      sql`${users.id} not in (select user_id from site_users where site_id = ${siteId})`,
    )
    .orderBy(users.email);

  if (candidates.length === 0) {
    return (
      <p className="mt-4 border-t border-border pt-4 text-xs text-text-faint">
        All users are already assigned to this site.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Add a member</p>
      {candidates.map((u) => (
        <form
          key={u.id}
          action={assignSiteAction.bind(null, u.id)}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="siteId" value={siteId} />
          <span className="flex-1 font-mono text-xs">
            {u.email}{" "}
            <span className="text-text-faint">({u.role})</span>
          </span>
          <select
            name="role"
            defaultValue="worker"
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            <option value="worker">worker</option>
            <option value="manager">manager</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover"
          >
            Add
          </button>
        </form>
      ))}
    </div>
  );
}

function Field({
  label,
  ...input
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-text-faint">
        {label}
      </span>
      <input
        {...input}
        className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
    </label>
  );
}

/** One tile in the per-site hub quick-link grid. Label + a small count/status
 *  badge. Tone drives the badge color (warning/danger for things that need a
 *  look). Keeps the detail page navigable without scrolling. */
function HubLink({
  href,
  label,
  badge,
  tone = "neutral",
}: {
  href: string;
  label: string;
  badge: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  const badgeCls =
    tone === "danger"
      ? "bg-danger-tint text-danger"
      : tone === "warning"
        ? "bg-warning-tint text-warning"
        : "bg-surface-2 text-text-muted";
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-surface-2"
    >
      <span className="text-xs font-medium text-text">{label}</span>
      <span className={`tnum rounded-full px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ${badgeCls}`}>
        {badge}
      </span>
    </Link>
  );
}

type IntegrationAccountRow = {
  id: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
} & Record<string, unknown>;

function syncHealthColor(lastSyncAt: Date | null | undefined): {
  dot: string;
  label: string;
} {
  if (!lastSyncAt) return { dot: "bg-text-faint", label: "Never synced" };
  const ageHours = (Date.now() - lastSyncAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < 24) return { dot: "bg-success", label: `Synced ${formatRelative(lastSyncAt)}` };
  if (ageHours < 72) return { dot: "bg-warning", label: `Synced ${formatRelative(lastSyncAt)}` };
  return { dot: "bg-danger", label: `Synced ${formatRelative(lastSyncAt)}` };
}

function IntegrationCard({
  label,
  siteSlug,
  provider,
  account,
  note,
}: {
  label: string;
  siteSlug: string;
  provider: "google";
  account: IntegrationAccountRow | undefined;
  note: string;
}) {
  const connected = !!account;
  const startHref = `/api/integrations/${provider}/start?site=${siteSlug}`;
  const health = syncHealthColor(account?.lastSyncAt ?? null);
  const errorShort = account?.lastSyncError ? account.lastSyncError.slice(0, 100) : null;

  return (
    <div
      className={cn(
        "rounded-md border p-3 transition-colors",
        connected
          ? "border-success/30 bg-success-tint"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-text">{label}</div>
        {connected ? (
          <a
            href={startHref}
            className="rounded-sm border border-border bg-surface px-1.5 py-0.5 text-xs font-medium uppercase text-text-muted hover:bg-surface-2 hover:text-text"
            title="Reconnect this integration"
          >
            Reconnect
          </a>
        ) : (
          <a
            href={startHref}
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium uppercase tracking-[0.04em] text-brand-navy-deep shadow-xs hover:bg-accent-hover"
          >
            Connect
          </a>
        )}
      </div>
      <div className="mt-1 text-xs text-text-faint">{note}</div>
      {connected ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", health.dot)} />
          <span>{health.label}</span>
          {account?.lastSyncStatus ? (
            <span
              className={cn(
                "ml-1 rounded px-1 py-px text-xs font-medium uppercase ring-1 ring-inset",
                account.lastSyncStatus === "ok"
                  ? "bg-success-tint text-success ring-success/30"
                  : "bg-danger-tint text-danger ring-danger/30",
              )}
            >
              {account.lastSyncStatus}
            </span>
          ) : null}
        </div>
      ) : null}
      {errorShort ? (
        <div className="mt-1 truncate text-xs text-danger" title={account?.lastSyncError ?? undefined}>
          {errorShort}
          {(account?.lastSyncError?.length ?? 0) > 100 ? "…" : ""}
        </div>
      ) : null}
    </div>
  );
}

/**
 * WordPress plugin connection card. Unlike Stripe/Google, WP doesn't use OAuth
 * — connectivity is proved by (a) an active api_keys row and (b) recent traffic
 * on that key or a recent event write. The "Connect" affordance scrolls to the
 * API keys section on the same page (where the user rotates a key and installs
 * the plugin).
 */
function WordPressCard({
  connection,
}: {
  connection: {
    hasKey: boolean;
    lastSignalAt: Date | null;
    isLive: boolean;
  };
}) {
  // Three visual states: Live (green), Idle (amber — key exists but no recent
  // signal), Not connected (neutral — no key).
  const state: "live" | "idle" | "off" = connection.isLive
    ? "live"
    : connection.hasKey
      ? "idle"
      : "off";

  const cardCls =
    state === "live"
      ? "border-success/30 bg-success-tint"
      : state === "idle"
        ? "border-warning/30 bg-warning-tint/40"
        : "border-border bg-surface hover:border-border-strong hover:bg-surface-2";

  const badge =
    state === "live"
      ? { label: "Connected", cls: "bg-success text-white" }
      : state === "idle"
        ? { label: "Idle", cls: "bg-warning text-white" }
        : { label: "Not connected", cls: "bg-surface-2 text-text-muted ring-1 ring-inset ring-border" };

  return (
    <div className={cn("rounded-md border p-3 transition-colors", cardCls)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-text">WordPress</div>
        {state === "off" ? (
          <a
            href="#api-keys"
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium uppercase tracking-[0.04em] text-brand-navy-deep shadow-xs hover:bg-accent-hover"
          >
            Connect
          </a>
        ) : (
          <span
            className={cn(
              "tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              badge.cls,
            )}
          >
            {badge.label}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-text-faint">
        {state === "off"
          ? "Install the GYL plugin to capture leads + events"
          : state === "live"
            ? "Plugin is heartbeating from the site"
            : "Plugin registered — no signal in 24h"}
      </div>
      {connection.lastSignalAt ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              state === "live" ? "bg-success" : "bg-warning",
            )}
          />
          <span>Last signal {formatRelative(connection.lastSignalAt)}</span>
        </div>
      ) : null}
    </div>
  );
}

function flashMsg(code: string): string {
  // Some codes carry a count suffix (e.g. `gsc-synced-14`). Peel that off so
  // the lookup still hits, and inject the count into the message when present.
  const syncedMatch = code.match(/^(gsc|ga4)-synced-(\d+)$/);
  if (syncedMatch) {
    const source = syncedMatch[1] === "gsc" ? "GSC" : "GA4";
    const n = syncedMatch[2];
    return `${source} sync complete — ${n} day${n === "1" ? "" : "s"} written to traffic_snapshots.`;
  }
  return (
    {
      created: "Site created.",
      saved: "Saved.",
      knowledge: "AI knowledge base saved. New customer chats will use the updated context.",
      "key-rotated": "API key rotated. The new one is shown above — save it now.",
      "key-revoked": "API key revoked.",
      invalid: "Invalid input.",
      "ga4-saved": "GA4 property_id saved.",
      "ga4-bad-property-id": "GA4 property_id must be numeric, e.g. 312345678.",
      "number-provisioned": "Phone number provisioned.",
      "twilio-not-configured": "Twilio credentials missing — set them in /admin/settings.",
      "google-not-configured":
        "Google OAuth is not configured yet. Open /admin/settings → Google (GSC + GA4) and paste the OAuth client ID + secret from your Google Cloud project.",
      "gsc-not-connected":
        "Google isn't connected for this site yet. Click Connect Google above first.",
      "gsc-no-property":
        "No matching GSC property. Verify the site's domain in Search Console under the same Google account you connected.",
      "gsc-sync-failed": "GSC sync failed. See lastSyncError in Integrations for details.",
      "ga4-not-connected":
        "Google isn't connected for this site yet. Click Connect Google above first.",
      "ga4-no-property-id":
        "Set the GA4 property_id above (e.g. 312345678), save it, then try Sync GA4 again.",
      "ga4-google-not-connected":
        "Can't save a GA4 property_id yet — this site hasn't authorized Google. Click Connect Google in the Integrations card above first, complete the consent screen, then set the property_id.",
      "ga4-sync-failed": "GA4 sync failed. See lastSyncError in Integrations for details.",
      "stripe-not-configured":
        "Stripe Connect is not configured yet. Open /admin/settings → Stripe Connect and paste the platform client ID + API key.",
      "square-not-configured":
        "Square is not configured yet. Open /admin/settings → Square and paste the application ID + secret.",
      "site-not-found": "Site not found — open the site again from the sites list.",
      "state-mismatch":
        "The OAuth handshake was interrupted. Try connecting again in the same browser tab.",
      "token-exchange-failed":
        "Google rejected the token exchange. Double-check the OAuth client ID/secret and that the redirect URI in Google Cloud matches this app.",
      "forward-to-must-be-e164": "Forward-to must be E.164 (e.g. +15551234567).",
      "area-code-must-be-digits": "Area code must be digits only.",
      "country-must-be-iso2": "Country must be a 2-letter ISO code.",
    }[code] ?? code
  );
}

/* ===========================================================================
 * SiteTaskRow — one row in the site detail Tasks panel. Status badge on the
 * left, title (linked to /admin/tasks/<id>) in the middle, assignee chip
 * (linked to /admin/users/<id>) + due date on the right. Tuned for scan-and-
 * triage, not for editing — editing happens on the task detail page.
 * =========================================================================== */
function SiteTaskRow({
  task,
}: {
  task: {
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: Date | null;
    assigneeId: string | null;
    assigneeName: string | null;
    assigneeEmail: string | null;
  };
}) {
  const assigneeDisplay = task.assigneeName || task.assigneeEmail || null;
  const isOverdue =
    task.dueAt && task.dueAt.getTime() < Date.now() && task.status !== "done" && task.status !== "cancelled";

  return (
    <li className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
      <TaskStatusBadge status={task.status} />
      <span className={`h-2 w-2 shrink-0 rounded-full ${priorityDotClass(task.priority)}`} title={`Priority: ${task.priority}`} />
      <Link href={`/admin/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-sm text-text hover:text-accent">
        {task.title}
      </Link>
      {assigneeDisplay && task.assigneeId ? (
        <Link
          href={`/admin/users/${task.assigneeId}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-muted hover:bg-accent-tint hover:text-accent"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
            {assigneeDisplay
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? "")
              .join("") || "?"}
          </span>
          <span className="max-w-[140px] truncate">{assigneeDisplay}</span>
        </Link>
      ) : (
        <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning">
          Unassigned
        </span>
      )}
      <span className={`shrink-0 text-xs tabular-nums ${isOverdue ? "font-medium text-danger" : "text-text-faint"}`}>
        {task.dueAt ? formatRelative(task.dueAt) : "—"}
      </span>
    </li>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const cls =
    status === "done"
      ? "bg-success-tint text-success"
      : status === "blocked"
        ? "bg-danger-tint text-danger"
        : status === "in_progress"
          ? "bg-warning-tint text-warning"
          : status === "in_review"
            ? "bg-info-tint text-info"
            : status === "cancelled"
              ? "bg-surface-3 text-text-faint"
              : "bg-accent-tint text-accent"; // todo
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function priorityDotClass(priority: string): string {
  return priority === "urgent"
    ? "bg-danger"
    : priority === "high"
      ? "bg-warning"
      : priority === "normal"
        ? "bg-accent"
        : "bg-text-faint";
}
