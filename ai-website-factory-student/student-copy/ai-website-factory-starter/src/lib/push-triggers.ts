/**
 * Push notification trigger scan.
 *
 * Runs every 5 min via cron. Detects high-signal events and drops one
 * notify:push job per (kind, id) so Wali's Mac worker fires the actual
 * Telegram message (zero per-message API spend).
 *
 * Dedup: a tiny push_sent log keyed on (kind, id, fired_for_day) ensures we
 * don't notify the same fix proposal 5 times in a row. New occurrences (new
 * day, or new id) re-fire.
 */
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  claudeJobs,
  fixProposals,
  leads,
  newSiteBuilds,
  sites,
} from "@/db/schema";

const FIVE_MIN_AGO = () => new Date(Date.now() - 5 * 60_000);
const THIRTY_MIN_AGO = () => new Date(Date.now() - 30 * 60_000);
const ONE_DAY_AGO = () => new Date(Date.now() - 24 * 3600_000);

export type PushTrigger = {
  kind: "high_fix" | "stuck_build" | "stale_lead" | "composite_drop";
  refId: string;
  title: string;
  body: string;
  href: string;
};

export async function detectTriggers(): Promise<PushTrigger[]> {
  const triggers: PushTrigger[] = [];

  // 1. High-priority fix proposals pending > 5min (operator hasn't seen yet).
  const fixes = await db()
    .select({
      id: fixProposals.id,
      label: fixProposals.label,
      siteId: fixProposals.siteId,
      domain: sites.domain,
    })
    .from(fixProposals)
    .leftJoin(sites, eq(sites.id, fixProposals.siteId))
    .where(and(
      eq(fixProposals.status, "pending"),
      eq(fixProposals.priority, "high"),
      lt(fixProposals.createdAt, FIVE_MIN_AGO()),
    ))
    .limit(10);
  for (const f of fixes) {
    triggers.push({
      kind: "high_fix",
      refId: f.id,
      title: `High-priority fix waiting`,
      body: `${f.domain ?? "—"}: ${f.label}`,
      href: `/admin/fix-queue#${f.id}`,
    });
  }

  // 2. New-site builds stuck > 24h with a blocker.
  const builds = await db()
    .select()
    .from(newSiteBuilds)
    .where(and(
      sql`${newSiteBuilds.state} != 'live'`,
      sql`${newSiteBuilds.blocker} IS NOT NULL`,
      lt(newSiteBuilds.updatedAt, ONE_DAY_AGO()),
    ))
    .limit(10);
  for (const b of builds) {
    triggers.push({
      kind: "stuck_build",
      refId: b.id,
      title: `Build stuck > 24h`,
      body: `${b.domain}: ${b.blocker}`,
      href: `/admin/new-site/${b.id}`,
    });
  }

  // 3. Stale leads — uncontacted for 30+ min.
  const staleLeads = await db()
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      siteId: leads.siteId,
      domain: sites.domain,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(sites, eq(sites.id, leads.siteId))
    .where(and(
      eq(leads.status, "new"),
      lt(leads.createdAt, THIRTY_MIN_AGO()),
    ))
    .limit(10);
  for (const l of staleLeads) {
    triggers.push({
      kind: "stale_lead",
      refId: l.id,
      title: `Lead waiting > 30min`,
      body: `${l.domain ?? "—"}: ${l.name ?? l.email ?? "Anonymous"}`,
      href: `/admin/leads/${l.id}`,
    });
  }

  // 4. Composite-score drops ≥ 10 pts week-over-week.
  // Skip sites with an active dismissal whose `dismissed_until_score` is
  // still above the current composite (or NULL meaning "until operator
  // clears it explicitly").
  const drops = await db().execute(sql`
    WITH ranked AS (
      SELECT site_id, composite_score, run_date,
             ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY run_date DESC) AS rn
      FROM site_health_audits
      WHERE composite_score IS NOT NULL
    )
    SELECT
      a.site_id AS site_id,
      a.composite_score AS latest,
      b.composite_score AS prior,
      s.domain AS domain,
      s.slug AS slug
    FROM ranked a
    JOIN ranked b ON a.site_id = b.site_id AND b.rn = 2
    JOIN sites s ON s.id = a.site_id
    LEFT JOIN push_drop_dismissals d ON d.site_id = a.site_id
    WHERE a.rn = 1
      AND (b.composite_score - a.composite_score) >= 10
      AND (
        d.site_id IS NULL
        OR (d.dismissed_until_score IS NOT NULL AND a.composite_score < d.dismissed_until_score)
      )
    LIMIT 10
  `);
  const dropRows = (drops.rows ?? drops) as Array<{
    site_id: string; latest: number; prior: number; domain: string; slug: string;
  }>;
  for (const d of dropRows) {
    const delta = Number(d.prior) - Number(d.latest);
    triggers.push({
      kind: "composite_drop",
      refId: d.site_id,
      title: `${d.domain}: composite dropped ${delta} pts`,
      body: `${d.prior} → ${d.latest}. Worth investigating.`,
      href: `/admin/sites/${d.slug}`,
    });
  }

  return triggers;
}

/**
 * Drops a notify:push job for each trigger. The Mac worker picks it up and
 * sends Telegram. Dedup is done at the worker level via `push_sent` log
 * (created lazily on first call).
 */
export async function dispatchTriggers(triggers: PushTrigger[]): Promise<number> {
  if (triggers.length === 0) return 0;
  let queued = 0;
  for (const t of triggers) {
    await db().insert(claudeJobs).values({
      kind: "notify:push",
      title: `Push · ${t.title}`,
      input: {
        kind: t.kind,
        refId: t.refId,
        title: t.title,
        body: t.body,
        href: t.href,
      },
      status: "pending",
      priority: "normal",
      preferWorker: "mac",
    });
    queued++;
  }
  return queued;
}
