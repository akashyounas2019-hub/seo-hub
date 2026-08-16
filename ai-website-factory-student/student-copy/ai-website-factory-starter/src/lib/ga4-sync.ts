/**
 * Shared library for pulling GA4 data into `traffic_snapshots`.
 *
 * Data source: Google Analytics Data API (GA4) `runReport`
 *   POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport
 *
 * GA4 property IDs live on `integrations_accounts.metadata.ga4_property_id`
 * (numeric, e.g. "312345678"). Set via the site's GA4 form. If missing, the
 * sync skips the site with reason "no-property-id".
 *
 * Used by:
 *   - `src/scripts/sync-ga4.ts`  — daily CLI cron
 *   - `src/app/actions/sync.ts`  — per-site "Sync now" button
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationsAccounts, trafficSnapshots } from "@/db/schema";
import { getValidGoogleToken } from "@/lib/google-oauth";

interface RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

interface GaError {
  error?: { code: number; message: string; status: string };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** GA4 daily rows come back as YYYYMMDD strings — convert to YYYY-MM-DD. */
function normalizeGaDate(raw: string): string | null {
  if (!/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/**
 * Region filter. GA4's `country` dimension uses the country's ENGLISH NAME,
 * not an ISO code — Google decided this many years ago and it's stuck.
 * Reference: https://ga-dev-tools.google/dimensions-metrics-explorer/
 */
export type Ga4Region = "are" | "worldwide";
const GA4_REGION_LABELS: Record<Ga4Region, string> = {
  are: "United Arab Emirates",
  worldwide: "Worldwide",
};

async function ga4RunReport(
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  region: Ga4Region,
): Promise<
  { ok: true; data: RunReportResponse } | { ok: false; status: number; error: string }
> {
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "conversions" },
      { name: "engagementRate" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: "10000",
  };
  if (region !== "worldwide") {
    body.dimensionFilter = {
      filter: {
        fieldName: "country",
        stringFilter: {
          matchType: "EXACT",
          value: GA4_REGION_LABELS[region],
        },
      },
    };
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
    const body = (await res.json().catch(() => ({}))) as GaError;
    return {
      ok: false,
      status: res.status,
      error: body.error?.message ?? `HTTP ${res.status}`,
    };
  }
  const data = (await res.json()) as RunReportResponse;
  return { ok: true, data };
}

export type Ga4SyncResult =
  | { ok: true; written: number; propertyId: string }
  | { ok: false; error: string; reason: "not-connected" | "no-property-id" | "api-error" };

async function loadPropertyId(siteId: string): Promise<string | null> {
  const [row] = await db()
    .select({ metadata: integrationsAccounts.metadata })
    .from(integrationsAccounts)
    .where(
      and(
        eq(integrationsAccounts.siteId, siteId),
        eq(integrationsAccounts.provider, "google"),
      ),
    )
    .limit(1);
  const raw = row?.metadata?.ga4_property_id;
  if (typeof raw !== "string") return null;
  // The saved form stores it as `properties/312345678` (or raw numeric).
  // GA4's runReport endpoint needs the numeric id only.
  const m = raw.match(/^(?:properties\/)?(\d+)$/);
  return m ? m[1] : null;
}

export async function syncGa4ForSite(
  site: { id: string; domain: string },
  days = 28,
  region: Ga4Region = "are",
): Promise<Ga4SyncResult> {
  const accessToken = await getValidGoogleToken(site.id);
  if (!accessToken) {
    return { ok: false, error: "not connected or token refresh failed", reason: "not-connected" };
  }
  const propertyId = await loadPropertyId(site.id);
  if (!propertyId) {
    return {
      ok: false,
      error:
        "no ga4_property_id — set it via the site's Integrations panel (e.g. 312345678)",
      reason: "no-property-id",
    };
  }

  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await ga4RunReport(accessToken, propertyId, isoDay(start), isoDay(end), region);
  if (!result.ok) {
    return { ok: false, error: result.error, reason: "api-error" };
  }

  let written = 0;
  for (const row of result.data.rows ?? []) {
    const rawDate = row.dimensionValues?.[0]?.value ?? "";
    const snapshotDate = normalizeGaDate(rawDate);
    if (!snapshotDate) continue;
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    const users = Number(row.metricValues?.[1]?.value ?? 0);
    const conversions = Number(row.metricValues?.[2]?.value ?? 0);
    const engagementRate = Number(row.metricValues?.[3]?.value ?? 0);
    const metrics = { sessions, users, conversions, engagementRate };
    const detail = {
      propertyId,
      region,
      regionLabel: GA4_REGION_LABELS[region],
    };
    await db()
      .insert(trafficSnapshots)
      .values({
        siteId: site.id,
        source: "ga4",
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

  return { ok: true, written, propertyId };
}
