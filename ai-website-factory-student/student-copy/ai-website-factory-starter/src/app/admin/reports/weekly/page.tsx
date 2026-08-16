/**
 * Executive weekly report (P1) — the single page Wali opens at 06:00 Monday.
 *
 * Pulls all six network scores + per-site rollup, surfaces the biggest WoW
 * deltas, lists the top 5 hot sites + top 5 cold sites. A "Generate PDF"
 * button kicks the same script that the Monday cron runs.
 */
import Link from "next/link";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  leads,
  payments,
  seoActions,
  siteScores,
  sites,
} from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { ScoreGrid, SCORE_LABELS, ScoreRing } from "@/components/ui/ScoreRing";
import { SCORE_KEYS, getNetworkScores, type ScoreKey } from "@/lib/scoring";
import { formatCents } from "@/lib/pricing";
import { requireAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600_000;

export default async function ExecutiveWeeklyReport() {
  await ensureSchema();
  await requireAdmin();
  const d = db();
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const lastWeekStart = new Date(now.getTime() - 14 * DAY_MS);
  const today = now.toISOString().slice(0, 10);
  const weekAgoStr = weekStart.toISOString().slice(0, 10);

  // ─── Network scores with WoW deltas ───────────────────────────────────
  const network = await getNetworkScores();

  // ─── Per-site composite (avg of all 6 scores) → hot/cold ──────────────
  const perSiteScores = await d
    .select({
      siteId: siteScores.siteId,
      scoreKey: siteScores.scoreKey,
      value: siteScores.value,
      date: siteScores.snapshotDate,
    })
    .from(siteScores)
    .where(sql`${siteScores.snapshotDate} >= ${weekAgoStr}`);

  // Group by site/date to assemble a per-site composite
  const bySite = new Map<string, { today: Map<string, number>; weekAgo: Map<string, number> }>();
  for (const r of perSiteScores) {
    if (!bySite.has(r.siteId)) bySite.set(r.siteId, { today: new Map(), weekAgo: new Map() });
    const slot = bySite.get(r.siteId)!;
    if (r.date === today) slot.today.set(r.scoreKey, r.value);
    else if (r.date <= weekAgoStr) slot.weekAgo.set(r.scoreKey, r.value);
  }

  const sitesList = await d.select({ id: sites.id, slug: sites.slug, name: sites.name }).from(sites);
  const siteRollup = sitesList.map((s) => {
    const slot = bySite.get(s.id);
    const todayVals = slot ? Array.from(slot.today.values()) : [];
    const weekAgoVals = slot ? Array.from(slot.weekAgo.values()) : [];
    const composite = todayVals.length > 0 ? Math.round(todayVals.reduce((a, b) => a + b, 0) / todayVals.length) : null;
    const compositeWeekAgo = weekAgoVals.length > 0 ? Math.round(weekAgoVals.reduce((a, b) => a + b, 0) / weekAgoVals.length) : null;
    const delta = composite !== null && compositeWeekAgo !== null ? composite - compositeWeekAgo : null;
    return { ...s, composite, delta };
  });

  const ranked = siteRollup.filter((s) => s.composite !== null).sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
  const hot = ranked.slice(0, 5);
  // Bottom-5 excludes anything already in the top-5 so a site can't appear in
  // both "performing" and "needs attention" (which happened with ≤10 sites).
  const cold = ranked.slice(5).reverse().slice(0, 5);

  // ─── Biggest movers (WoW delta) ───────────────────────────────────────
  const movers = siteRollup
    .filter((s) => s.delta !== null)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    .slice(0, 5);

  // ─── Network operational KPIs this week vs last ──────────────────────
  const [leadsRow] = await d
    .select({
      thisWeek: sql<number>`count(*) filter (where ${leads.createdAt} >= ${weekStart.toISOString()}::timestamptz)::int`,
      lastWeek: sql<number>`count(*) filter (where ${leads.createdAt} >= ${lastWeekStart.toISOString()}::timestamptz and ${leads.createdAt} < ${weekStart.toISOString()}::timestamptz)::int`,
    })
    .from(leads);

  const [revRow] = await d
    .select({
      thisWeek: sql<number>`coalesce(sum(amount_cents::bigint) filter (where ${payments.receivedAt} >= ${weekStart.toISOString()}::timestamptz and ${payments.status} = 'succeeded'), 0)::bigint`,
      lastWeek: sql<number>`coalesce(sum(amount_cents::bigint) filter (where ${payments.receivedAt} >= ${lastWeekStart.toISOString()}::timestamptz and ${payments.receivedAt} < ${weekStart.toISOString()}::timestamptz and ${payments.status} = 'succeeded'), 0)::bigint`,
    })
    .from(payments);

  const [fixesRow] = await d
    .select({
      thisWeek: sql<number>`count(*) filter (where ${seoActions.createdAt} >= ${weekStart.toISOString()}::timestamptz and ${seoActions.success} = true)::int`,
      lastWeek: sql<number>`count(*) filter (where ${seoActions.createdAt} >= ${lastWeekStart.toISOString()}::timestamptz and ${seoActions.createdAt} < ${weekStart.toISOString()}::timestamptz and ${seoActions.success} = true)::int`,
    })
    .from(seoActions);

  const leadsThis = leadsRow?.thisWeek ?? 0;
  const leadsLast = leadsRow?.lastWeek ?? 0;
  const revThis = Number(revRow?.thisWeek ?? 0);
  const revLast = Number(revRow?.lastWeek ?? 0);
  const fixesThis = fixesRow?.thisWeek ?? 0;
  const fixesLast = fixesRow?.lastWeek ?? 0;

  const overallComposite =
    ranked.length > 0
      ? Math.round(ranked.reduce((a, b) => a + (b.composite ?? 0), 0) / ranked.length)
      : null;
  const overallCompositeWeekAgo = (() => {
    const vals = siteRollup
      .map((s) => {
        const slot = bySite.get(s.id);
        const weekAgoVals = slot ? Array.from(slot.weekAgo.values()) : [];
        return weekAgoVals.length > 0 ? Math.round(weekAgoVals.reduce((a, b) => a + b, 0) / weekAgoVals.length) : null;
      })
      .filter((n): n is number => n !== null);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  })();
  const overallDelta = overallComposite !== null && overallCompositeWeekAgo !== null ? overallComposite - overallCompositeWeekAgo : null;

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <Link href="/admin/reports" className="text-xs text-text-faint hover:text-text">
          ← Reports
        </Link>
        <h1 className="">
          Executive weekly
        </h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Week of {weekStart.toISOString().slice(0, 10)} → {today}. Auto-generated every Monday 06:00 UTC.
        </p>
      </header>

      {/* ---------- Headline KPIs ---------- */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Composite (network)" value={overallComposite !== null ? `${overallComposite}` : "—"} delta={overallDelta} unit="" />
        <KpiCard label="Leads" value={String(leadsThis)} delta={leadsThis - leadsLast} unit="" />
        <KpiCard label="Revenue (week)" value={formatCents(revThis)} delta={Math.round((revThis - revLast) / 100)} unit="$" />
        <KpiCard label="Fixes applied" value={String(fixesThis)} delta={fixesThis - fixesLast} unit="" />
      </section>

      {/* ---------- Network scores grid ---------- */}
      <section className="rounded-xl border border-border bg-surface px-5 py-4">
        <h2 className="">Network scores</h2>
        <p className="text-xs text-text-faint">Network average for each of the six composite dimensions.</p>
        <div className="mt-3">
          <ScoreGrid scores={network} size="md" />
        </div>
      </section>

      {/* ---------- Biggest movers ---------- */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="">Biggest movers (week-over-week)</h2>
        {movers.length === 0 ? (
          <p className="mt-1.5 text-xs text-text-faint">No movers yet — need 7+ days of score history.</p>
        ) : (
          <RowList>
            {movers.map((m) => (
              <Row key={m.id}>
                <Link href={`/admin/sites/${m.slug}`} className="flex flex-1 items-center gap-3">
                  <Pill tone={(m.delta ?? 0) >= 0 ? "success" : "danger"}>
                    {(m.delta ?? 0) >= 0 ? "▲" : "▼"} {Math.abs(m.delta ?? 0)}
                  </Pill>
                  <span className="flex-1 text-sm text-text">{m.name}</span>
                  <span className="tnum text-xs text-text-muted">{m.composite}</span>
                </Link>
              </Row>
            ))}
          </RowList>
        )}
      </section>

      {/* ---------- Hot / Cold ----------
          With ≤5 scored sites, a separate Top-5 and Bottom-5 list the same
          sites twice (a site showing up as both "top performer" and "needs
          attention"), so collapse to a single best→worst ranking. */}
      {ranked.length === 0 ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="">Network ranking</h2>
          <p className="mt-1.5 text-xs text-text-faint">No scores yet.</p>
        </section>
      ) : ranked.length <= 5 ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="">Network sites — best to worst</h2>
          <ol className="mt-2 space-y-1.5">
            {ranked.map((s, i) => {
              const c = s.composite ?? 0;
              const toneClass = c >= 60 ? "text-success" : c >= 40 ? "text-warning" : "text-danger";
              return (
                <li key={s.id} className="flex items-center gap-3">
                  <span className="w-5 text-right tnum text-xs text-text-faint">{i + 1}</span>
                  <Link href={`/admin/sites/${s.slug}`} className="flex-1 text-xs text-text hover:underline">
                    {s.name}
                  </Link>
                  <span className={`tnum text-xs font-medium ${toneClass}`}>{s.composite}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="">Top 5 — performing</h2>
            <ol className="mt-2 space-y-1.5">
              {hot.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span className="w-5 text-right tnum text-xs text-text-faint">{i + 1}</span>
                  <Link href={`/admin/sites/${s.slug}`} className="flex-1 text-xs text-text hover:underline">
                    {s.name}
                  </Link>
                  <span className="tnum text-xs font-medium text-success">{s.composite}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="">Bottom 5 — needs attention</h2>
            {cold.length === 0 ? (
              <p className="mt-1.5 text-xs text-text-faint">All sites are performing well.</p>
            ) : (
              <ol className="mt-2 space-y-1.5">
                {cold.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3">
                    <span className="w-5 text-right tnum text-xs text-text-faint">{i + 1}</span>
                    <Link href={`/admin/sites/${s.slug}`} className="flex-1 text-xs text-text hover:underline">
                      {s.name}
                    </Link>
                    <span className="tnum text-xs font-medium text-danger">{s.composite}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {/* ---------- Per-site table ---------- */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="">Per-site composite</h2>
        <p className="mt-0.5 text-xs text-text-faint">Avg of the six dimensions — click any site for its score breakdown.</p>
        <RowList footer={`${ranked.length} site${ranked.length === 1 ? "" : "s"}`}>
          {ranked.map((s) => (
            <Row key={s.id}>
              <Link href={`/admin/sites/${s.slug}`} className="flex flex-1 items-center gap-3">
                <span className="flex-1 text-xs text-text">{s.name}</span>
                <Pill
                  tone={
                    s.composite === null
                      ? "neutral"
                      : s.composite >= 75
                        ? "success"
                        : s.composite >= 50
                          ? "accent"
                          : s.composite >= 25
                            ? "warning"
                            : "danger"
                  }
                >
                  {s.composite}
                </Pill>
                <span
                  className={`tnum w-12 text-right text-xs ${
                    (s.delta ?? 0) > 0
                      ? "text-success"
                      : (s.delta ?? 0) < 0
                        ? "text-danger"
                        : "text-text-faint"
                  }`}
                >
                  {s.delta === null ? "—" : `${s.delta > 0 ? "+" : ""}${s.delta}`}
                </span>
              </Link>
            </Row>
          ))}
        </RowList>
      </section>

      <p className="text-xs text-text-faint">
        PDF version is generated every Monday 06:00 UTC by the <code className="font-mono">weekly:report</code> cron and delivered via Telegram + email.
      </p>
    </div>
  );
}

function KpiCard({ label, value, delta, unit }: { label: string; value: string; delta: number | null; unit: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-text-faint">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold leading-none text-text">{value}</p>
      {delta !== null ? (
        <p
          className={`mt-1.5 tnum text-xs ${
            delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-text-faint"
          }`}
        >
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "·"} {unit}
          {Math.abs(delta).toLocaleString()}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-text-faint">—</p>
      )}
    </div>
  );
}
