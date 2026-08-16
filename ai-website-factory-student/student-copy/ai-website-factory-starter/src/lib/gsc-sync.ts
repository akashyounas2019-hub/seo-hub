/**
 * Shared library for pulling GSC data into `traffic_snapshots`.
 *
 * Used by:
 *   - `src/scripts/sync-gsc.ts`   — the daily CLI cron
 *   - `src/app/actions/sync.ts`   — the per-site "Sync now" button
 *
 * The CLI wraps this in a loop with console logging; the action wraps it
 * with a single site + revalidate/redirect. Business logic lives here.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  gscPageSnapshots,
  gscQuerySnapshots,
  integrationsAccounts,
  trafficSnapshots,
} from "@/db/schema";
import { getValidGoogleToken } from "@/lib/google-oauth";

interface GscQueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscQueryResponse {
  rows?: GscQueryRow[];
}

interface GscError {
  error?: { code: number; message: string; status: string };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** GSC properties can be registered as URL-prefix OR domain — try both. */
function propertyUrlCandidates(domain: string): string[] {
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return [`https://${clean}/`, `sc-domain:${clean}`];
}

/**
 * Region filter constants — the platform is Dubai-focused, so we scope every
 * sync to UAE traffic. `region: "are"` filters on country (Search Console
 * uses ISO 3166 3-letter codes: `are` = United Arab Emirates). The `region`
 * dimension is stored on the snapshot so future multi-region support can
 * pull the same table without a schema change.
 */
export type GscRegion = "are" | "worldwide";
const REGION_LABELS: Record<GscRegion, string> = {
  are: "United Arab Emirates",
  worldwide: "Worldwide",
};

type GscDimension = "date" | "query" | "page" | "country";

async function gscQuery(
  accessToken: string,
  property: string,
  startDate: string,
  endDate: string,
  region: GscRegion,
  dimensions: GscDimension[] = ["date"],
  rowLimit = 25000,
): Promise<
  { ok: true; rows: GscQueryRow[] } | { ok: false; status: number; error: string }
> {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const body: Record<string, unknown> = {
    startDate,
    endDate,
    dimensions,
    rowLimit,
    dataState: "final",
  };
  if (region !== "worldwide") {
    body.dimensionFilterGroups = [
      {
        filters: [
          { dimension: "country", operator: "equals", expression: region },
        ],
      },
    ];
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as GscError;
    return {
      ok: false,
      status: res.status,
      error: body.error?.message ?? `HTTP ${res.status}`,
    };
  }
  const data = (await res.json()) as GscQueryResponse;
  return { ok: true, rows: data.rows ?? [] };
}

export type GscSyncResult =
  | { ok: true; written: number; property: string }
  | { ok: false; error: string; reason: "not-connected" | "no-property" | "api-error" };

export async function syncGscForSite(
  site: { id: string; domain: string },
  days = 28,
  region: GscRegion = "are",
): Promise<GscSyncResult> {
  const accessToken = await getValidGoogleToken(site.id);
  if (!accessToken) {
    return { ok: false, error: "not connected or token refresh failed", reason: "not-connected" };
  }

  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const startDate = isoDay(start);
  const endDate = isoDay(end);

  let resolvedProperty: string | null = null;
  let rows: GscQueryRow[] = [];
  let lastErr: { status: number; error: string } | null = null;

  for (const property of propertyUrlCandidates(site.domain)) {
    const result = await gscQuery(accessToken, property, startDate, endDate, region);
    if (result.ok) {
      resolvedProperty = property;
      rows = result.rows;
      break;
    }
    lastErr = { status: result.status, error: result.error };
    if (result.status !== 403 && result.status !== 404) break;
  }

  if (!resolvedProperty) {
    return {
      ok: false,
      error: lastErr?.error ?? "no matching GSC property found",
      reason: lastErr?.status === 403 || lastErr?.status === 404 ? "no-property" : "api-error",
    };
  }

  let written = 0;
  for (const row of rows) {
    const [snapshotDate] = row.keys;
    if (!snapshotDate) continue;
    const metrics = {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    };
    const detail = {
      property: resolvedProperty,
      region,
      regionLabel: REGION_LABELS[region],
    };
    await db()
      .insert(trafficSnapshots)
      .values({
        siteId: site.id,
        source: "gsc",
        snapshotDate,
        metrics,
        detail,
      })
      .onConflictDoUpdate({
        target: [trafficSnapshots.siteId, trafficSnapshots.source, trafficSnapshots.snapshotDate],
        set: { metrics, detail },
      });
    written++;
  }

  // ── Per-query + per-page snapshots ──
  //
  // GSC does not expose per-day-per-query rows in a single call, so we bucket:
  //   window A = last `days`         → snapshot_date = end of window A
  //   window B = the `days` before A → snapshot_date = end of window B
  // The /admin/gsc widgets read the two most-recent snapshots per query/page
  // and diff them to find gainers/losers.
  const windowSizeDays = days;
  const winAEnd = end;
  const winAStart = new Date(winAEnd.getTime() - windowSizeDays * 24 * 60 * 60 * 1000);
  const winBEnd = new Date(winAStart.getTime());
  const winBStart = new Date(winBEnd.getTime() - windowSizeDays * 24 * 60 * 60 * 1000);

  await syncDimensionWindow(
    accessToken,
    resolvedProperty,
    site.id,
    "query",
    isoDay(winAStart),
    isoDay(winAEnd),
    isoDay(winAEnd),
    region,
  );
  await syncDimensionWindow(
    accessToken,
    resolvedProperty,
    site.id,
    "query",
    isoDay(winBStart),
    isoDay(winBEnd),
    isoDay(winBEnd),
    region,
  );
  await syncDimensionWindow(
    accessToken,
    resolvedProperty,
    site.id,
    "page",
    isoDay(winAStart),
    isoDay(winAEnd),
    isoDay(winAEnd),
    region,
  );
  await syncDimensionWindow(
    accessToken,
    resolvedProperty,
    site.id,
    "page",
    isoDay(winBStart),
    isoDay(winBEnd),
    isoDay(winBEnd),
    region,
  );

  return { ok: true, written, property: resolvedProperty };
}

/**
 * Pull one window's totals for a single dimension (query or page) and upsert
 * one row per (site, dimensionValue, snapshotDate). The snapshotDate is the
 * end of the window, not the calendar day — that's how the widgets identify
 * "current" vs "prior" buckets.
 */
async function syncDimensionWindow(
  accessToken: string,
  property: string,
  siteId: string,
  dimension: "query" | "page",
  startDate: string,
  endDate: string,
  snapshotDate: string,
  region: GscRegion,
): Promise<void> {
  const result = await gscQuery(accessToken, property, startDate, endDate, region, [dimension], 5000);
  if (!result.ok) return; // silent — main sync already recorded the error
  const table = dimension === "query" ? gscQuerySnapshots : gscPageSnapshots;
  const keyCol = dimension === "query" ? gscQuerySnapshots.query : gscPageSnapshots.page;
  const dateCol = dimension === "query" ? gscQuerySnapshots.snapshotDate : gscPageSnapshots.snapshotDate;
  const siteCol = dimension === "query" ? gscQuerySnapshots.siteId : gscPageSnapshots.siteId;

  for (const row of result.rows) {
    const [key] = row.keys;
    if (!key) continue;
    const values = {
      siteId,
      [dimension]: key,
      snapshotDate,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      detail: {
        property,
        region,
        windowStart: startDate,
        windowEnd: endDate,
      },
    } as typeof table.$inferInsert;
    await db()
      .insert(table)
      .values(values)
      .onConflictDoUpdate({
        target: [siteCol, keyCol, dateCol],
        set: {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
          detail: values.detail,
        },
      });
  }
}

export async function stampSyncStatus(
  siteId: string,
  status: "ok" | "error",
  error: string | null,
): Promise<void> {
  await db()
    .update(integrationsAccounts)
    .set({
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncError: error?.slice(0, 500) ?? null,
    })
    .where(
      and(
        eq(integrationsAccounts.siteId, siteId),
        eq(integrationsAccounts.provider, "google"),
      ),
    );
}
