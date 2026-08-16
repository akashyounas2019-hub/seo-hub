/**
 * Core CWV sync loop — shared by the cron route and the tsx cron script.
 * Pulls CrUX History for every site (PHONE + DESKTOP) and upserts into
 * cwv_snapshots. Returns a per-site summary. Skips quietly when an origin
 * has no CrUX data.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, cwvSnapshots, orgSettings, type NewCwvSnapshot } from "@/db/schema";
import { fetchCruxHistory, toCls } from "@/lib/crux";
import { decrypt } from "@/lib/crypto";

export interface CwvSyncRow {
  slug: string;
  domain: string;
  pulled: number;
  skipped?: boolean;
  error?: string;
}

export async function syncAllCwv(): Promise<CwvSyncRow[]> {
  const [orgRow] = await db().select({ googleCruxApiKeyCiphertext: orgSettings.googleCruxApiKeyCiphertext }).from(orgSettings).where(sql`${orgSettings.id} = 'singleton'`).limit(1);
  const apiKey = orgRow?.googleCruxApiKeyCiphertext
    ? decrypt(orgRow.googleCruxApiKeyCiphertext)
    : process.env.GOOGLE_CRUX_API_KEY || undefined;

  const allSites = await db().select({ id: sites.id, domain: sites.domain, slug: sites.slug }).from(sites);
  const summary: CwvSyncRow[] = [];

  for (const s of allSites) {
    const origin = `https://${s.domain}`;
    const row: CwvSyncRow = { slug: s.slug, domain: s.domain, pulled: 0 };
    try {
      for (const formFactor of ["PHONE", "DESKTOP"] as const) {
        const records = await fetchCruxHistory({ origin, formFactor, apiKey });
        if (!records) continue;
        for (const r of records) {
          const snap: NewCwvSnapshot = {
            siteId: s.id,
            snapshotDate: r.date,
            formFactor: formFactor.toLowerCase(),
            lcpP75: r.lcpP75Ms ?? null,
            inpP75: r.inpP75Ms ?? null,
            clsP75x1000: toCls(r.clsP75) ?? null,
            fcpP75: r.fcpP75Ms ?? null,
            ttfbP75: r.ttfbP75Ms ?? null,
            source: "crux",
            raw: r as unknown as Record<string, unknown>,
          };
          await db()
            .insert(cwvSnapshots)
            .values(snap)
            .onConflictDoUpdate({
              target: [cwvSnapshots.siteId, cwvSnapshots.snapshotDate, cwvSnapshots.formFactor],
              set: {
                lcpP75: snap.lcpP75,
                inpP75: snap.inpP75,
                clsP75x1000: snap.clsP75x1000,
                fcpP75: snap.fcpP75,
                ttfbP75: snap.ttfbP75,
                raw: snap.raw,
              },
            });
          row.pulled++;
        }
      }
      if (row.pulled === 0) row.skipped = true;
    } catch (e) {
      row.error = (e as Error).message.slice(0, 200);
    }
    summary.push(row);
  }
  return summary;
}
