/**
 * Daily IndexNow submission quota — tracks actual usage against an
 * admin-configurable cap (org_settings.indexnow_daily_quota, default 200).
 * This is NOT tied to PageSpeed/CrUX quota; those are separate API keys
 * with their own (Google-side) rate limits. One global row per UTC day.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { indexingQuotaUsage, orgSettings } from "@/db/schema";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

/** Call after every successful IndexNow submission to bump the daily counter. */
export async function recordIndexNowUsage(urlCount: number): Promise<void> {
  if (urlCount <= 0) return;
  const day = todayKey();
  await db()
    .insert(indexingQuotaUsage)
    .values({ day, siteId: null, urlsSubmitted: urlCount, requestsMade: 1 })
    .onConflictDoUpdate({
      target: [indexingQuotaUsage.day],
      targetWhere: sql`${indexingQuotaUsage.siteId} is null`,
      set: {
        urlsSubmitted: sql`${indexingQuotaUsage.urlsSubmitted} + ${urlCount}`,
        requestsMade: sql`${indexingQuotaUsage.requestsMade} + 1`,
        updatedAt: new Date(),
      },
    });
}

export interface QuotaSnapshot {
  used: number;
  cap: number;
  pct: number;
  tone: "ok" | "warning" | "danger";
}

/** Today's IndexNow usage vs. the configured daily cap, for the UI card. */
export async function getIndexNowQuota(): Promise<QuotaSnapshot> {
  const day = todayKey();
  const [usageRow] = await db()
    .select({ used: indexingQuotaUsage.urlsSubmitted })
    .from(indexingQuotaUsage)
    .where(sql`${indexingQuotaUsage.day} = ${day} and ${indexingQuotaUsage.siteId} is null`)
    .limit(1);
  const [settingsRow] = await db()
    .select({ cap: orgSettings.indexnowDailyQuota })
    .from(orgSettings)
    .where(sql`${orgSettings.id} = 'singleton'`)
    .limit(1);

  const used = usageRow?.used ?? 0;
  const cap = settingsRow?.cap ?? 200;
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const tone = pct >= 90 ? "danger" : pct > 50 ? "warning" : "ok";
  return { used, cap, pct, tone };
}
