import Link from "next/link";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/server-auth";
import { db, ensureSchema } from "@/db/client";
import { sites, leads, tasks, seoProposals, events, siteGbp, integrationsAccounts, trafficSnapshots, payments } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

function healthScore(metrics: { leadsCount: number; openIssues: number; overdueTasks: number; failedProposals: number; eventsCount: number }): number {
  let score = 50;
  if (metrics.eventsCount > 0) score += 10;
  if (metrics.leadsCount > 0) score += Math.min(metrics.leadsCount * 2, 20);
  score -= metrics.openIssues * 3;
  score -= metrics.overdueTasks * 5;
  score -= metrics.failedProposals * 4;
  return Math.max(0, Math.min(100, score));
}

function healthBarColor(health: number): string {
  if (health >= 70) return "var(--success)";
  if (health >= 50) return "var(--warning)";
  return "var(--danger)";
}

function healthTint(health: number): string {
  if (health >= 70) return "var(--success-tint)";
  if (health >= 50) return "var(--warning-tint)";
  return "var(--danger-tint)";
}

const severityConfig = {
  critical: { color: "var(--danger)", tint: "var(--danger-tint)", label: "Critical" },
  high: { color: "var(--warning)", tint: "var(--warning-tint)", label: "High" },
  medium: { color: "var(--info)", tint: "var(--info-tint)", label: "Medium" },
};

export default async function AgencyHealthPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const [siteRows, leadStats, taskStats, proposalStats, eventStats, gbpRows, integrationRows, revenueStats, trafficStats] = await Promise.all([
    d.select({ id: sites.id, name: sites.name, domain: sites.domain, city: sites.city, slug: sites.slug }).from(sites),

    d.select({
      siteId: leads.siteId,
      total: sql<number>`count(*)::int`,
      recent: sql<number>`count(*) filter (where ${leads.createdAt} >= now() - interval '30 days')::int`,
    }).from(leads).groupBy(leads.siteId),

    d.select({
      siteId: tasks.siteId,
      open: sql<number>`count(*) filter (where ${tasks.status} in ('todo','in_progress'))::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.status} in ('todo','in_progress') and ${tasks.dueAt} < now())::int`,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    }).from(tasks).groupBy(tasks.siteId),

    d.select({
      siteId: seoProposals.siteId,
      pending: sql<number>`count(*) filter (where ${seoProposals.status} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${seoProposals.status} = 'failed')::int`,
    }).from(seoProposals).groupBy(seoProposals.siteId),

    d.select({
      siteId: events.siteId,
      recent: sql<number>`count(*) filter (where ${events.receivedAt} >= now() - interval '7 days')::int`,
    }).from(events).groupBy(events.siteId),

    d.select({
      siteId: siteGbp.siteId,
      ratingValue: siteGbp.ratingValue,
      ratingCount: siteGbp.ratingCount,
    }).from(siteGbp),

    d.select({
      siteId: integrationsAccounts.siteId,
      provider: integrationsAccounts.provider,
      lastSyncStatus: integrationsAccounts.lastSyncStatus,
    }).from(integrationsAccounts),

    d.select({
      siteId: payments.siteId,
      totalRevenueCents: sql<number>`coalesce(sum(${payments.amountCents}::int), 0)::int`,
      count: sql<number>`count(*)::int`,
    }).from(payments).groupBy(payments.siteId),

    d.select({
      siteId: trafficSnapshots.siteId,
      totalClicks: sql<number>`coalesce(sum((${trafficSnapshots.metrics}->>'clicks')::int), 0)::int`,
      totalImpressions: sql<number>`coalesce(sum((${trafficSnapshots.metrics}->>'impressions')::int), 0)::int`,
    }).from(trafficSnapshots).groupBy(trafficSnapshots.siteId),
  ]);

  const leadMap = new Map(leadStats.map(r => [r.siteId, r]));
  const taskMap = new Map(taskStats.map(r => [r.siteId, r]));
  const proposalMap = new Map(proposalStats.map(r => [r.siteId, r]));
  const eventMap = new Map(eventStats.map(r => [r.siteId, r]));
  const gbpMap = new Map(gbpRows.map(r => [r.siteId, r]));
  const revenueMap = new Map(revenueStats.map(r => [r.siteId, { ...r, totalRevenue: Math.round(r.totalRevenueCents / 100) }]));
  const trafficMap = new Map(trafficStats.map(r => [r.siteId, r]));

  const clients = siteRows.map(site => {
    const ls = leadMap.get(site.id);
    const ts = taskMap.get(site.id);
    const ps = proposalMap.get(site.id);
    const es = eventMap.get(site.id);
    const gbp = gbpMap.get(site.id);
    const rev = revenueMap.get(site.id) as { totalRevenue: number; count: number } | undefined;
    const traf = trafficMap.get(site.id);

    const leadsCount = ls?.recent ?? 0;
    const openIssues = (ps?.pending ?? 0) + (ps?.failed ?? 0);
    const overdueTasks = ts?.overdue ?? 0;
    const failedProposals = ps?.failed ?? 0;
    const eventsCount = es?.recent ?? 0;

    const health = healthScore({ leadsCount, openIssues, overdueTasks, failedProposals, eventsCount });

    return {
      id: site.id,
      slug: site.slug,
      name: site.name,
      domain: site.domain,
      city: site.city,
      health,
      leadsRecent: leadsCount,
      leadsTotal: ls?.total ?? 0,
      openTasks: ts?.open ?? 0,
      totalTasks: ts?.total ?? 0,
      doneTasks: ts?.done ?? 0,
      issues: openIssues + overdueTasks,
      rating: gbp?.ratingValue ? parseFloat(gbp.ratingValue) : 0,
      reviews: gbp?.ratingCount ?? 0,
      color: healthBarColor(health),
      tint: healthTint(health),
      overdueTasks,
      failedProposals,
      pendingProposals: ps?.pending ?? 0,
      eventsRecent: eventsCount,
      revenue: rev?.totalRevenue ?? 0,
      paymentCount: rev?.count ?? 0,
      clicks: traf?.totalClicks ?? 0,
      impressions: traf?.totalImpressions ?? 0,
    };
  }).sort((a, b) => a.health - b.health);

  const issues: { client: string; slug: string; issue: string; severity: "critical" | "high" | "medium" }[] = [];
  for (const c of clients) {
    if (c.overdueTasks > 0) {
      issues.push({ client: c.name, slug: c.slug, issue: `${c.overdueTasks} overdue task${c.overdueTasks > 1 ? "s" : ""} need attention`, severity: c.overdueTasks >= 3 ? "critical" : "high" });
    }
    if (c.failedProposals > 0) {
      issues.push({ client: c.name, slug: c.slug, issue: `${c.failedProposals} SEO proposal${c.failedProposals > 1 ? "s" : ""} failed to deploy`, severity: "high" });
    }
    if (c.pendingProposals > 5) {
      issues.push({ client: c.name, slug: c.slug, issue: `${c.pendingProposals} SEO proposals pending review`, severity: "medium" });
    }
    if (c.eventsRecent === 0 && c.leadsTotal > 0) {
      issues.push({ client: c.name, slug: c.slug, issue: "No events received in 7 days — plugin may be disconnected", severity: "critical" });
    }
    if (c.health < 40) {
      issues.push({ client: c.name, slug: c.slug, issue: `Health score critically low at ${c.health}`, severity: "critical" });
    }
  }
  issues.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2 };
    return order[a.severity] - order[b.severity];
  });

  const networkHealth = clients.length > 0
    ? Math.round(clients.reduce((sum, c) => sum + c.health, 0) / clients.length)
    : 0;
  const totalLeads = clients.reduce((s, c) => s + c.leadsRecent, 0);
  const totalRevenue = clients.reduce((s, c) => s + c.revenue, 0);
  const totalOverdue = clients.reduce((s, c) => s + c.overdueTasks, 0);

  const connectedCount = new Set(integrationRows.map(r => r.siteId)).size;

  return (
    <div className="mx-auto max-w-[1080px] space-y-6">
      <PageHeader
        title="Agency Health"
        subtitle="Multi-client dashboard — health scores, fire-fighting priorities, client overview, and profitability across all managed websites."
      />

      {/* ── Top bar: websites count + Add New Website ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">Websites</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-text">{clients.length}</p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="text-xs text-text-muted">{connectedCount} with integrations</span>
              <span className="text-xs text-text-muted">{clients.filter(c => c.health >= 70).length} healthy</span>
            </div>
          </div>
        </div>
        <Link
          href="/admin/sites/new"
          className="group flex items-center gap-4 rounded-lg border-2 border-dashed border-border bg-surface p-4 transition-colors hover:border-accent/50 hover:bg-accent-tint"
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-tint text-accent transition-colors group-hover:bg-accent group-hover:text-white"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-text group-hover:text-accent">Add New Website</p>
            <p className="text-xs text-text-muted">Connect another site to the network</p>
          </div>
        </Link>
      </div>

      {/* ── Network KPIs ── */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <KpiCard label="Network Health" value={`${networkHealth}`} suffix="/100" color={healthBarColor(networkHealth)} />
        <KpiCard label="Leads (30d)" value={`${totalLeads}`} color="var(--info)" />
        <KpiCard label="Revenue" value={`$${totalRevenue.toLocaleString()}`} color="var(--success)" />
        <KpiCard label="Overdue Tasks" value={`${totalOverdue}`} color={totalOverdue > 0 ? "var(--danger)" : "var(--success)"} />
      </div>

      {/* ── Client overview: clickable cards ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text">Client Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link
              key={c.slug}
              href={`/admin/sites/${c.slug}`}
              className="group relative overflow-hidden rounded-lg border border-border bg-surface p-4 transition-all hover:border-accent/40 hover:shadow-md"
            >
              <div
                className="absolute left-0 top-0 h-[3px] w-full"
                style={{ background: c.color }}
              />
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: c.tint, color: c.color }}
                >
                  {c.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text group-hover:text-accent">{c.name}</p>
                  <p className="text-[11px] text-text-faint">{c.domain}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-text-faint transition-colors group-hover:text-accent">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>

              <div className="mb-3">
                <div className="mb-1 flex items-end justify-between">
                  <span className="text-xs text-text-muted">Health</span>
                  <span className="text-lg font-bold text-text">{c.health}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${c.health}%`, background: c.color }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-surface-2 px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-text">{c.leadsRecent}</p>
                  <p className="text-[10px] text-text-faint">Leads</p>
                </div>
                <div className="rounded-md bg-surface-2 px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-text">{c.openTasks}</p>
                  <p className="text-[10px] text-text-faint">Open Tasks</p>
                </div>
                <div className="rounded-md bg-surface-2 px-2 py-1.5 text-center">
                  <p className="text-xs font-bold text-text">
                    {c.rating > 0 ? c.rating.toFixed(1) : "—"}
                  </p>
                  <p className="text-[10px] text-text-faint">Rating</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Fire-fighting priority list ── */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Fire-fighting Priority</h2>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--danger-tint)", color: "var(--danger)" }}
          >
            {issues.length} issue{issues.length !== 1 ? "s" : ""}
          </span>
        </div>
        {issues.length === 0 ? (
          <p className="text-xs text-text-muted">No active issues across the network.</p>
        ) : (
          <div className="space-y-2">
            {issues.map((item, i) => {
              const cfg = severityConfig[item.severity];
              return (
                <Link
                  key={i}
                  href={`/admin/sites/${item.slug}`}
                  className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface-3"
                >
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: cfg.color }}
                  />
                  <span className="shrink-0 text-xs font-medium text-text-muted">
                    {item.client}
                  </span>
                  <span className="flex-1 text-xs text-text-muted">{item.issue}</span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: cfg.tint, color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Profitability tracker ── */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text">Profitability Tracker</h2>
        {clients.length === 0 ? (
          <p className="text-xs text-text-muted">No sites configured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 font-semibold text-text-faint">Site</th>
                  <th className="pb-2 pr-4 text-right font-semibold text-text-faint">Revenue</th>
                  <th className="pb-2 pr-4 text-right font-semibold text-text-faint">Leads (30d)</th>
                  <th className="pb-2 pr-4 text-right font-semibold text-text-faint">Clicks</th>
                  <th className="pb-2 pr-4 text-right font-semibold text-text-faint">Impressions</th>
                  <th className="pb-2 text-right font-semibold text-text-faint">Tasks Done</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.slug} className="border-b border-border/50">
                    <td className="py-2.5 pr-4">
                      <Link href={`/admin/sites/${c.slug}`} className="hover:text-accent">
                        <p className="font-medium text-text">{c.name}</p>
                        <p className="text-[10px] text-text-faint">{c.domain}</p>
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-text">
                      ${c.revenue.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-text-muted">
                      {c.leadsRecent}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-text-muted">
                      {c.clicks.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-text-muted">
                      {c.impressions.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-text-muted">
                      {c.doneTasks}/{c.totalTasks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Connection status ── */}
      <AccountsStatus siteRows={siteRows} integrationRows={integrationRows} />
    </div>
  );
}

function KpiCard({ label, value, suffix, color }: { label: string; value: string; suffix?: string; color: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border px-4 py-3"
      style={{ background: "linear-gradient(180deg, var(--surface), var(--surface-2))" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <p className="text-xs font-semibold uppercase tracking-[0.10em] text-text-faint">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums leading-none tracking-tight" style={{ color }}>
        {value}{suffix ? <span className="text-sm font-normal text-text-faint">{suffix}</span> : null}
      </p>
    </div>
  );
}

const PROVIDERS = ["google", "stripe", "square"] as const;
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google (GSC / GA4)",
  stripe: "Stripe",
  square: "Square",
};

function AccountsStatus({
  siteRows,
  integrationRows,
}: {
  siteRows: { id: string; name: string; domain: string; slug: string }[];
  integrationRows: { siteId: string; provider: string; lastSyncStatus: string | null }[];
}) {
  const connectedSet = new Set(integrationRows.map(r => `${r.siteId}::${r.provider}`));
  const statusMap = new Map(integrationRows.map(r => [`${r.siteId}::${r.provider}`, r.lastSyncStatus]));

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text">Connection Status</h2>
      {siteRows.length === 0 ? (
        <p className="text-xs text-text-muted">No sites configured yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4 font-semibold text-text-faint">Site</th>
                {PROVIDERS.map(p => (
                  <th key={p} className="pb-2 pr-4 text-center font-semibold text-text-faint">{PROVIDER_LABELS[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {siteRows.map(site => (
                <tr key={site.id} className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <Link href={`/admin/sites/${site.slug}`} className="hover:text-accent">
                      <p className="font-medium text-text">{site.name}</p>
                      <p className="text-[10px] text-text-faint">{site.domain}</p>
                    </Link>
                  </td>
                  {PROVIDERS.map(provider => {
                    const key = `${site.id}::${provider}`;
                    const connected = connectedSet.has(key);
                    const syncStatus = statusMap.get(key);
                    return (
                      <td key={provider} className="py-2.5 pr-4 text-center">
                        {connected ? (
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{
                              background: syncStatus === "error" ? "var(--warning-tint)" : "var(--success-tint)",
                              color: syncStatus === "error" ? "var(--warning)" : "var(--success)",
                            }}
                          >
                            {syncStatus === "error" ? "Sync error" : "Connected"}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-text-faint">
                            Not connected
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
