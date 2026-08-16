/**
 * P1 — Composite scoring library.
 *
 * Six scores, all deterministic, all 0–100. Each formula is opinionated
 * but tunable later via the P6 prompt library (we move the weights into
 * a settings row and let the admin edit).
 *
 * Inputs are pulled from existing tables (no new data collection): GSC
 * traffic snapshots, seo_findings, seo_actions, site_pages, traffic
 * snapshots, payments, etc. Each input gets normalised to 0–100 then
 * combined with a weight.
 *
 * The returned `inputs` blob is stored alongside the score so the UI can
 * show "you scored 73 because X was 90 and Y was 50" — explainability matters.
 */
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  payments,
  seoActions,
  seoFindings,
  seoOutcomeSnapshots,
  seoProposals,
  sitePages,
  trafficSnapshots,
} from "../db/schema";

export type ScoreKey =
  | "site_health"
  | "seo"
  | "design_freshness"
  | "competitor_pressure"
  | "content_decay"
  | "local_seo_completeness";

export interface ComputedScore {
  key: ScoreKey;
  value: number;             // 0-100
  inputs: Record<string, number>;
}

const DAY_MS = 24 * 3600_000;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

interface Ctx {
  siteId: string;
  siteDomain: string;
  now: Date;
}

// ────────────────────────────────────────────────────────────────────
// Helpers — convert raw counts into 0–100 sub-scores
// ────────────────────────────────────────────────────────────────────

/** Inverse — fewer findings = higher score. `cap` = the count at which sub-score hits 0. */
function inverseCount(n: number, cap: number): number {
  if (n <= 0) return 100;
  return clamp(100 - Math.round((n / cap) * 100));
}

/** Direct — higher value = higher score, until `target`. */
function directRatio(value: number, target: number): number {
  if (target <= 0) return 0;
  return clamp(Math.round((value / target) * 100));
}

async function countFindings(siteId: string, severity: string[] | null, since: Date | null): Promise<number> {
  const where = [eq(seoFindings.siteId, siteId)];
  if (since) where.push(gte(seoFindings.createdAt, since));
  if (severity && severity.length > 0) {
    where.push(sql`${seoFindings.severity}::text = ANY(ARRAY[${sql.join(severity.map(s => sql`${s}`), sql`, `)}]::text[])`);
  }
  const [row] = await db().select({ n: count() }).from(seoFindings).where(and(...where));
  return Number(row?.n ?? 0);
}

// ────────────────────────────────────────────────────────────────────
// 1. Site Health — overall liveness + uptime + fix application rate
// ────────────────────────────────────────────────────────────────────

async function scoreSiteHealth(ctx: Ctx): Promise<ComputedScore> {
  const inputs: Record<string, number> = {};
  // a) critical/high findings in last 7d (inverse, cap at 10).
  const weekAgo = new Date(ctx.now.getTime() - 7 * DAY_MS);
  const criticalFindings = await countFindings(ctx.siteId, ["critical", "high"], weekAgo);
  inputs.criticalFindingsWeek = criticalFindings;
  const sub_critical = inverseCount(criticalFindings, 10);

  // b) fix success rate (applied vs failed in 30d).
  const monthAgo = new Date(ctx.now.getTime() - 30 * DAY_MS);
  const [actionStats] = await db()
    .select({
      ok: sql<number>`count(*) filter (where ${seoActions.success} = true)::int`,
      bad: sql<number>`count(*) filter (where ${seoActions.success} = false)::int`,
    })
    .from(seoActions)
    .where(and(eq(seoActions.siteId, ctx.siteId), gte(seoActions.createdAt, monthAgo)));
  const ok = actionStats?.ok ?? 0;
  const bad = actionStats?.bad ?? 0;
  const total = ok + bad;
  inputs.fixesApplied30d = ok;
  inputs.fixesFailed30d = bad;
  const sub_fixRate = total === 0 ? 80 : clamp((ok / total) * 100);

  // c) recent traffic snapshot exists (heartbeat / GSC liveness).
  const [traffic] = await db()
    .select({ n: count() })
    .from(trafficSnapshots)
    .where(and(eq(trafficSnapshots.siteId, ctx.siteId), gte(trafficSnapshots.createdAt, weekAgo)));
  inputs.trafficSnapshotsWeek = Number(traffic?.n ?? 0);
  const sub_liveness = inputs.trafficSnapshotsWeek > 0 ? 100 : 50;

  // Weighted composite.
  const value = clamp(0.4 * sub_critical + 0.4 * sub_fixRate + 0.2 * sub_liveness);
  return { key: "site_health", value, inputs };
}

// ────────────────────────────────────────────────────────────────────
// 2. SEO — combines technical, on-page, and outcome trend
// ────────────────────────────────────────────────────────────────────

async function scoreSeo(ctx: Ctx): Promise<ComputedScore> {
  const inputs: Record<string, number> = {};
  const monthAgo = new Date(ctx.now.getTime() - 30 * DAY_MS);

  // a) Technical findings count (inverse, cap 20).
  const techFindings = await countFindings(ctx.siteId, null, monthAgo);
  inputs.allFindings30d = techFindings;
  const sub_findings = inverseCount(techFindings, 30);

  // b) Outcome trend — average position delta from outcome snapshots.
  const [snap] = await db()
    .select({
      avgPosThis: sql<number>`avg(${seoOutcomeSnapshots.positionMilli}) filter (where ${seoOutcomeSnapshots.daysAfter} = 14)::int`,
      n: sql<number>`count(*) filter (where ${seoOutcomeSnapshots.daysAfter} = 14)::int`,
    })
    .from(seoOutcomeSnapshots)
    .where(and(eq(seoOutcomeSnapshots.siteId, ctx.siteId), gte(seoOutcomeSnapshots.capturedAt, monthAgo)));
  inputs.outcomeAvgPositionMilli = Number(snap?.avgPosThis ?? 0);
  inputs.outcomeCount = Number(snap?.n ?? 0);
  // Lower position = better. Map position 1.0 → 100, 30+ → 0.
  let sub_outcome = 75;  // default when no GSC data
  if (inputs.outcomeCount > 0 && inputs.outcomeAvgPositionMilli > 0) {
    const pos = inputs.outcomeAvgPositionMilli / 1000;
    sub_outcome = clamp(100 - ((pos - 1) / 29) * 100);
  }

  // c) Proposals applied vs pending — high applied ratio = active SEO.
  const [props] = await db()
    .select({
      applied: sql<number>`count(*) filter (where ${seoProposals.status} = 'applied')::int`,
      pending: sql<number>`count(*) filter (where ${seoProposals.status} = 'pending')::int`,
    })
    .from(seoProposals)
    .where(and(eq(seoProposals.siteId, ctx.siteId), gte(seoProposals.createdAt, monthAgo)));
  inputs.proposalsApplied30d = props?.applied ?? 0;
  inputs.proposalsPending30d = props?.pending ?? 0;
  const propTotal = inputs.proposalsApplied30d + inputs.proposalsPending30d;
  const sub_proposals = propTotal === 0 ? 60 : clamp((inputs.proposalsApplied30d / propTotal) * 100);

  const value = clamp(0.45 * sub_findings + 0.35 * sub_outcome + 0.2 * sub_proposals);
  return { key: "seo", value, inputs };
}

// ────────────────────────────────────────────────────────────────────
// 3. Design Freshness — how recently the design was reviewed/updated
// ────────────────────────────────────────────────────────────────────

async function scoreDesignFreshness(ctx: Ctx): Promise<ComputedScore> {
  const inputs: Record<string, number> = {};
  // a) Pages with design overrides (signal that design's been touched).
  const [overrideRow] = await db()
    .select({ n: count() })
    .from(sitePages)
    .where(and(eq(sitePages.siteId, ctx.siteId), eq(sitePages.hasDesignOverride, true)));
  inputs.pagesWithOverride = Number(overrideRow?.n ?? 0);
  const [totalRow] = await db()
    .select({ n: count() })
    .from(sitePages)
    .where(eq(sitePages.siteId, ctx.siteId));
  inputs.pagesTotal = Number(totalRow?.n ?? 0);
  const overrideRatio = inputs.pagesTotal > 0 ? inputs.pagesWithOverride / inputs.pagesTotal : 0;
  const sub_overrides = clamp(40 + overrideRatio * 60);

  // b) Average page modified-age (younger = fresher).
  const [age] = await db()
    .select({
      avgAgeDays: sql<number>`avg(extract(epoch from (now() - ${sitePages.modifiedAt})) / 86400)::int`,
    })
    .from(sitePages)
    .where(eq(sitePages.siteId, ctx.siteId));
  inputs.avgPageAgeDays = Number(age?.avgAgeDays ?? 365);
  // 0 days → 100, 730+ days → 0.
  const sub_age = clamp(100 - (inputs.avgPageAgeDays / 730) * 100);

  const value = clamp(0.55 * sub_age + 0.45 * sub_overrides);
  return { key: "design_freshness", value, inputs };
}

// ────────────────────────────────────────────────────────────────────
// 4. Competitor Pressure — INVERSE: higher value = MORE pressure on us
// ────────────────────────────────────────────────────────────────────

async function scoreCompetitorPressure(ctx: Ctx): Promise<ComputedScore> {
  const inputs: Record<string, number> = {};
  // Number of "adopt" items pending from competitor teardowns.
  const monthAgo = new Date(ctx.now.getTime() - 60 * DAY_MS);
  const findings = await db()
    .select({ payload: seoFindings.payload })
    .from(seoFindings)
    .where(
      and(
        eq(seoFindings.siteId, ctx.siteId),
        eq(seoFindings.code, "competitor-teardown"),
        gte(seoFindings.createdAt, monthAgo),
      ),
    );
  let adoptItems = 0;
  for (const f of findings) {
    const p = (f.payload ?? {}) as Record<string, unknown>;
    if (Array.isArray(p.adopt)) adoptItems += p.adopt.length;
  }
  inputs.competitorAdoptItems = adoptItems;
  inputs.competitorTeardowns = findings.length;
  // 0 items = 0 pressure (perfect), 20+ items = 100 pressure (alarm).
  const value = clamp((adoptItems / 20) * 100);
  return { key: "competitor_pressure", value, inputs };
}

// ────────────────────────────────────────────────────────────────────
// 5. Content Decay — INVERSE: higher = more decay = bad
// ────────────────────────────────────────────────────────────────────

async function scoreContentDecay(ctx: Ctx): Promise<ComputedScore> {
  const inputs: Record<string, number> = {};
  const monthAgo = new Date(ctx.now.getTime() - 30 * DAY_MS);

  // Findings: thin + stale + missing-author + missing-sources.
  const decayCodes = ["thin-content", "stale-content", "missing-author", "missing-sources"];
  const [row] = await db()
    .select({ n: count() })
    .from(seoFindings)
    .where(
      and(
        eq(seoFindings.siteId, ctx.siteId),
        sql`${seoFindings.code} = ANY(ARRAY[${sql.join(decayCodes.map(c => sql`${c}`), sql`, `)}]::text[])`,
        gte(seoFindings.createdAt, monthAgo),
      ),
    );
  inputs.decayFindings30d = Number(row?.n ?? 0);

  // Pages older than 12 months / pages total.
  const yearAgo = new Date(ctx.now.getTime() - 365 * DAY_MS);
  const [stale] = await db()
    .select({ n: count() })
    .from(sitePages)
    .where(and(eq(sitePages.siteId, ctx.siteId), sql`${sitePages.modifiedAt} < ${yearAgo.toISOString()}::timestamptz`));
  const [allP] = await db().select({ n: count() }).from(sitePages).where(eq(sitePages.siteId, ctx.siteId));
  inputs.stalePages = Number(stale?.n ?? 0);
  inputs.totalPages = Number(allP?.n ?? 0);
  const staleRatio = inputs.totalPages > 0 ? inputs.stalePages / inputs.totalPages : 0;

  // Composite: half from findings count, half from stale ratio.
  const sub_findings = clamp((inputs.decayFindings30d / 20) * 100);
  const sub_stale = clamp(staleRatio * 100);
  const value = clamp(0.5 * sub_findings + 0.5 * sub_stale);
  return { key: "content_decay", value, inputs };
}

// ────────────────────────────────────────────────────────────────────
// 6. Local SEO Completeness — directly aligned with cleaning-services/local business
// ────────────────────────────────────────────────────────────────────

async function scoreLocalSeo(ctx: Ctx): Promise<ComputedScore> {
  const inputs: Record<string, number> = {};
  const monthAgo = new Date(ctx.now.getTime() - 30 * DAY_MS);

  // NAP issues in last 30d.
  const napCodes = ["nap-phone-mismatch", "nap-phone-missing"];
  const [napRow] = await db()
    .select({ n: count() })
    .from(seoFindings)
    .where(
      and(
        eq(seoFindings.siteId, ctx.siteId),
        sql`${seoFindings.code} = ANY(ARRAY[${sql.join(napCodes.map(c => sql`${c}`), sql`, `)}]::text[])`,
        gte(seoFindings.createdAt, monthAgo),
      ),
    );
  inputs.napIssues = Number(napRow?.n ?? 0);
  const sub_nap = inverseCount(inputs.napIssues, 3);

  // LocalBusiness schema present?
  const [schemaPresent] = await db()
    .select({
      ok: sql<number>`count(*) filter (where ${seoActions.success} = true)::int`,
    })
    .from(seoActions)
    .where(and(eq(seoActions.siteId, ctx.siteId), eq(seoActions.kind, "schema_inject")));
  inputs.schemaInjectsApplied = Number(schemaPresent?.ok ?? 0);
  const sub_schema = inputs.schemaInjectsApplied > 0 ? 100 : 40;

  // Revenue this month — proxy for whether local visibility is converting.
  const startOfMonth = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1);
  const [rev] = await db()
    .select({ total: sql<number>`coalesce(sum(amount_cents::numeric), 0)::int` })
    .from(payments)
    .where(and(eq(payments.siteId, ctx.siteId), eq(payments.status, "succeeded"), gte(payments.receivedAt, startOfMonth)));
  inputs.revenueMtdCents = Number(rev?.total ?? 0);
  // 0 → 50, $5,000+ → 100.
  const sub_revenue = clamp(50 + (inputs.revenueMtdCents / 500_000) * 50);

  const value = clamp(0.5 * sub_nap + 0.3 * sub_schema + 0.2 * sub_revenue);
  return { key: "local_seo_completeness", value, inputs };
}

// ────────────────────────────────────────────────────────────────────
// Public — compute all six scores for one site
// ────────────────────────────────────────────────────────────────────

export async function computeAllScores(siteId: string, siteDomain: string, now: Date = new Date()): Promise<ComputedScore[]> {
  const ctx: Ctx = { siteId, siteDomain, now };
  return Promise.all([
    scoreSiteHealth(ctx),
    scoreSeo(ctx),
    scoreDesignFreshness(ctx),
    scoreCompetitorPressure(ctx),
    scoreContentDecay(ctx),
    scoreLocalSeo(ctx),
  ]);
}

/** Pretty score keys for stable iteration. */
export const SCORE_KEYS: ScoreKey[] = [
  "site_health",
  "seo",
  "design_freshness",
  "competitor_pressure",
  "content_decay",
  "local_seo_completeness",
];

/** Get latest scores averaged across every site — for /admin overview. */
export async function getNetworkScores(): Promise<Array<{
  key: ScoreKey;
  current: number | null;
  weekAgo: number | null;
  delta: number | null;
}>> {
  const { siteScores } = await import("../db/schema");
  const today = new Date().toISOString().slice(0, 10);
  const weekAgoStr = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
  const rows = await db()
    .select({
      key: siteScores.scoreKey,
      avgValue: sql<number>`avg(${siteScores.value})::int`,
      date: siteScores.snapshotDate,
    })
    .from(siteScores)
    .where(sql`${siteScores.snapshotDate} >= ${weekAgoStr}`)
    .groupBy(siteScores.scoreKey, siteScores.snapshotDate);

  const latest = new Map<string, number>();
  const old = new Map<string, number>();
  for (const r of rows) {
    if (r.date === today) latest.set(r.key, Number(r.avgValue));
    else if (r.date <= weekAgoStr) old.set(r.key, Number(r.avgValue));
  }
  return SCORE_KEYS.map((k) => {
    const current = latest.has(k) ? latest.get(k)! : null;
    const weekAgo = old.has(k) ? old.get(k)! : null;
    const delta = current !== null && weekAgo !== null ? current - weekAgo : null;
    return { key: k, current, weekAgo, delta };
  });
}

/** Get latest scores for a site, plus the WoW deltas for trend arrows. */
export async function getScoresWithTrend(siteId: string): Promise<Array<{
  key: ScoreKey;
  current: number | null;
  weekAgo: number | null;
  delta: number | null;
}>> {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgoStr = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
  // Pull both days' scores in one query.
  const { siteScores } = await import("../db/schema");
  const rows = await db()
    .select({ key: siteScores.scoreKey, value: siteScores.value, date: siteScores.snapshotDate })
    .from(siteScores)
    .where(and(eq(siteScores.siteId, siteId), sql`${siteScores.snapshotDate} >= ${weekAgoStr}`));
  const latest = new Map<string, number>();
  const old = new Map<string, number>();
  for (const r of rows) {
    if (r.date === today) latest.set(r.key, r.value);
    else if (r.date <= weekAgoStr && (!old.has(r.key) || true)) old.set(r.key, r.value);
  }
  const keys: ScoreKey[] = ["site_health", "seo", "design_freshness", "competitor_pressure", "content_decay", "local_seo_completeness"];
  return keys.map((k) => {
    const current = latest.get(k) ?? null;
    const weekAgo = old.get(k) ?? null;
    const delta = current !== null && weekAgo !== null ? current - weekAgo : null;
    return { key: k, current, weekAgo, delta };
  });
}
