/**
 * P2 — Cross-site pattern detection.
 *
 * Each detector receives the full network state and returns zero or more
 * pattern proposals. The runner (`scripts/pattern-detect.ts`) then upserts
 * them into `site_patterns` and optionally spawns `agent_tasks` for the
 * actionable ones.
 *
 * Detectors are deliberately deterministic — they don't call the LLM.
 * The optional polish step (re-writing the title/description with the
 * LLM) lives in the runner and only fires when an Anthropic key exists.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  seoActions,
  seoFindings,
  siteScores,
  sitePages,
  sites,
  trafficSnapshots,
} from "../db/schema";

const DAY_MS = 24 * 3600_000;

export type PatternSeverity = "info" | "warning" | "critical";

export interface PatternProposal {
  /** Stable kind — used to dedupe. */
  kind: string;
  severity: PatternSeverity;
  title: string;
  summary: string;
  sitesAffected: string[]; // site IDs
  evidence: Record<string, unknown>;
  /** Optional — if set, the runner spawns an agent_task using this CTA. */
  cta?: { kind: string; title: string; description: string; href?: string; priority?: "high" | "normal" | "low" };
}

export interface DetectCtx {
  now: Date;
  allSiteIds: string[];
  threshold30Percent: number;
}

// ────────────────────────────────────────────────────────────────────
// 1. Network-wide finding spike — a finding code appears on >30% of sites
// ────────────────────────────────────────────────────────────────────

async function detectFindingSpike(ctx: DetectCtx): Promise<PatternProposal[]> {
  const since = new Date(ctx.now.getTime() - 30 * DAY_MS);
  const rows = await db()
    .select({
      code: seoFindings.code,
      siteId: seoFindings.siteId,
    })
    .from(seoFindings)
    .where(gte(seoFindings.createdAt, since));

  const byCode = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byCode.has(r.code)) byCode.set(r.code, new Set());
    byCode.get(r.code)!.add(r.siteId);
  }
  const proposals: PatternProposal[] = [];
  for (const [code, siteSet] of byCode) {
    if (siteSet.size < ctx.threshold30Percent) continue;
    const affected = Array.from(siteSet);
    const pct = Math.round((affected.length / ctx.allSiteIds.length) * 100);
    proposals.push({
      kind: `finding_spike:${code}`,
      severity: pct >= 60 ? "critical" : "warning",
      title: `${code} affects ${affected.length}/${ctx.allSiteIds.length} sites (${pct}%)`,
      summary: `The finding code "${code}" was raised on ${affected.length} sites in the last 30 days. Consider bulk-applying a fix or updating the scan rules.`,
      sitesAffected: affected,
      evidence: { code, occurrences30d: rows.filter((r) => r.code === code).length, sitePct: pct },
      cta: {
        kind: "apply_fix_bulk",
        title: `Apply ${code} fix across ${affected.length} sites`,
        description: `Open /admin/seo, filter by code = "${code}", and bulk-apply.`,
        href: `/admin/seo?code=${encodeURIComponent(code)}`,
        priority: pct >= 60 ? "high" : "normal",
      },
    });
  }
  return proposals;
}

// ────────────────────────────────────────────────────────────────────
// 2. No fixes applied — sites with zero successful seo_actions in 30d
// ────────────────────────────────────────────────────────────────────

async function detectNoFixes(ctx: DetectCtx): Promise<PatternProposal[]> {
  const since = new Date(ctx.now.getTime() - 30 * DAY_MS);
  const rows = await db()
    .select({
      siteId: sites.id,
      slug: sites.slug,
      name: sites.name,
      fixes: sql<number>`(select count(*)::int from seo_actions where seo_actions.site_id = ${sites.id} and seo_actions.success = true and seo_actions.created_at >= ${since.toISOString()}::timestamptz)`,
    })
    .from(sites);
  const dead = rows.filter((r) => Number(r.fixes ?? 0) === 0);
  if (dead.length === 0) return [];
  return [
    {
      kind: "no_fixes_30d",
      severity: dead.length >= ctx.allSiteIds.length / 2 ? "critical" : "warning",
      title: `${dead.length} site${dead.length === 1 ? "" : "s"} idle — no fixes applied in 30d`,
      summary: `The agent has not applied any SEO fix on these sites in the last 30 days. Investigate whether scans are running, the plugin is connected, or fixes are stuck pending approval.`,
      sitesAffected: dead.map((s) => s.siteId),
      evidence: { idleSites: dead.map((s) => s.slug), windowDays: 30 },
      cta: {
        kind: "review_pattern",
        title: "Review idle sites",
        description: "Check the SEO inbox for each site and ensure scans + the plugin are healthy.",
        href: "/admin/seo",
        priority: "high",
      },
    },
  ];
}

// ────────────────────────────────────────────────────────────────────
// 3. Stale pages — >50% of pages older than 12 months across the network
// ────────────────────────────────────────────────────────────────────

async function detectStaleContent(ctx: DetectCtx): Promise<PatternProposal[]> {
  const yearAgo = new Date(ctx.now.getTime() - 365 * DAY_MS);
  const rows = await db()
    .select({
      siteId: sites.id,
      slug: sites.slug,
      total: sql<number>`(select count(*)::int from site_pages where site_pages.site_id = ${sites.id})`,
      stale: sql<number>`(select count(*)::int from site_pages where site_pages.site_id = ${sites.id} and site_pages.modified_at < ${yearAgo.toISOString()}::timestamptz)`,
    })
    .from(sites);
  const heavy = rows.filter((r) => Number(r.total) > 0 && Number(r.stale) / Number(r.total) > 0.5);
  if (heavy.length === 0) return [];
  return [
    {
      kind: "stale_content_network",
      severity: heavy.length >= 5 ? "warning" : "info",
      title: `${heavy.length} site${heavy.length === 1 ? " has" : "s have"} more than 50% stale pages`,
      summary: `Half or more of the pages on these sites haven't been modified in 12+ months. Schedule a content-refresh sprint or use the AI page-design feature to update them.`,
      sitesAffected: heavy.map((s) => s.siteId),
      evidence: { heavySites: heavy.map((s) => ({ slug: s.slug, stale: s.stale, total: s.total })) },
      cta: {
        kind: "review_pattern",
        title: "Content refresh sprint",
        description: "Visit /admin/sites/<slug>/pages — sort by modifiedAt, refresh oldest first.",
        priority: "normal",
      },
    },
  ];
}

// ────────────────────────────────────────────────────────────────────
// 4. Network score decline — average score dropped 5+ points WoW
// ────────────────────────────────────────────────────────────────────

async function detectScoreDecline(ctx: DetectCtx): Promise<PatternProposal[]> {
  const today = ctx.now.toISOString().slice(0, 10);
  const weekAgo = new Date(ctx.now.getTime() - 7 * DAY_MS).toISOString().slice(0, 10);
  const rows = await db()
    .select({
      key: siteScores.scoreKey,
      date: siteScores.snapshotDate,
      avg: sql<number>`avg(${siteScores.value})::int`,
    })
    .from(siteScores)
    .where(sql`${siteScores.snapshotDate} >= ${weekAgo}`)
    .groupBy(siteScores.scoreKey, siteScores.snapshotDate);
  const todayMap = new Map<string, number>();
  const oldMap = new Map<string, number>();
  for (const r of rows) {
    if (r.date === today) todayMap.set(r.key, Number(r.avg));
    else if (r.date <= weekAgo) oldMap.set(r.key, Number(r.avg));
  }
  const proposals: PatternProposal[] = [];
  for (const [key, cur] of todayMap) {
    const prev = oldMap.get(key);
    if (prev === undefined) continue;
    const delta = cur - prev;
    if (delta <= -5) {
      proposals.push({
        kind: `score_decline:${key}`,
        severity: delta <= -10 ? "critical" : "warning",
        title: `Network "${key}" score dropped ${Math.abs(delta)} points week-over-week`,
        summary: `Average across the network fell from ${prev} to ${cur}. Investigate the per-site breakdown — the executive weekly report flags the biggest movers.`,
        sitesAffected: [], // network-wide signal
        evidence: { scoreKey: key, previousAvg: prev, currentAvg: cur, delta },
        cta: {
          kind: "review_pattern",
          title: "Open executive weekly",
          description: "See per-site WoW deltas + biggest movers.",
          href: "/admin/reports/weekly",
          priority: "high",
        },
      });
    }
  }
  return proposals;
}

// ────────────────────────────────────────────────────────────────────
// 5. Low brand-theme coverage — sites without a theme row
// ────────────────────────────────────────────────────────────────────

async function detectLowBrandCoverage(ctx: DetectCtx): Promise<PatternProposal[]> {
  const rows = await db().execute<{ site_id: string; slug: string }>(sql`
    SELECT s.id AS site_id, s.slug AS slug
    FROM sites s
    LEFT JOIN site_themes t ON t.site_id = s.id
    WHERE t.site_id IS NULL OR t.source = 'fallback_default'
  `);
  const arr = rows.rows ?? rows;
  const missing: Array<{ site_id: string; slug: string }> = Array.isArray(arr) ? arr : [];
  if (missing.length === 0) return [];
  return [
    {
      kind: "low_brand_coverage",
      severity: missing.length >= 5 ? "warning" : "info",
      title: `${missing.length} site${missing.length === 1 ? "" : "s"} still on the fallback brand theme`,
      summary: `These sites haven't had a real brand theme extracted yet — the booking widget renders in the platform default instead of matching the site's actual look. Bulk-extract from /admin/sites/brand.`,
      sitesAffected: missing.map((m) => m.site_id),
      evidence: { missingSlugs: missing.map((m) => m.slug) },
      cta: {
        kind: "brand_refresh",
        title: "Bulk-extract brand themes",
        description: "Open /admin/sites/brand, Select all, Re-extract selected.",
        href: "/admin/sites/brand",
        priority: "normal",
      },
    },
  ];
}

// ────────────────────────────────────────────────────────────────────
// 6. Sites silent for 36h+ — heartbeat missing (operational)
// ────────────────────────────────────────────────────────────────────

async function detectSilentSites(ctx: DetectCtx): Promise<PatternProposal[]> {
  const cutoff = new Date(ctx.now.getTime() - 36 * 3600_000);
  const rows = await db().execute<{ id: string; slug: string }>(sql`
    SELECT s.id, s.slug
    FROM sites s
    WHERE NOT EXISTS (
      SELECT 1 FROM events e WHERE e.site_id = s.id AND e.received_at >= ${cutoff.toISOString()}::timestamptz
    )
  `);
  const arr = rows.rows ?? rows;
  const silent: Array<{ id: string; slug: string }> = Array.isArray(arr) ? arr : [];
  if (silent.length === 0) return [];
  return [
    {
      kind: "silent_sites_36h",
      severity: silent.length >= 3 ? "critical" : "warning",
      title: `${silent.length} site${silent.length === 1 ? " is" : "s are"} silent for 36+ hours`,
      summary: `No events received from these sites in 36+ hours. The plugin might be deactivated, the API key rotated, or the site is down.`,
      sitesAffected: silent.map((s) => s.id),
      evidence: { silentSlugs: silent.map((s) => s.slug) },
      cta: {
        kind: "review_pattern",
        title: "Check silent sites",
        description: "Visit /admin/sites — silent ones surface as 'silent' badge. Re-issue API keys if needed.",
        href: "/admin/sites",
        priority: "high",
      },
    },
  ];
}

// ────────────────────────────────────────────────────────────────────
// Public — run all detectors
// ────────────────────────────────────────────────────────────────────

export async function detectAllPatterns(now: Date = new Date()): Promise<PatternProposal[]> {
  const allSites = await db().select({ id: sites.id }).from(sites);
  const allSiteIds = allSites.map((s) => s.id);
  if (allSiteIds.length === 0) return [];
  const ctx: DetectCtx = {
    now,
    allSiteIds,
    threshold30Percent: Math.max(2, Math.ceil(allSiteIds.length * 0.3)),
  };
  const all = await Promise.all([
    detectFindingSpike(ctx),
    detectNoFixes(ctx),
    detectStaleContent(ctx),
    detectScoreDecline(ctx),
    detectLowBrandCoverage(ctx),
    detectSilentSites(ctx),
  ]);
  return all.flat();
}
