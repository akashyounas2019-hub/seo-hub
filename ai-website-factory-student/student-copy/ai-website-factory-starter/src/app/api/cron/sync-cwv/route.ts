/**
 * POST /api/cron/sync-cwv
 *
 * Pulls CrUX History for every site (PHONE + DESKTOP form factors) and
 * upserts into `cwv_snapshots`. Designed for a daily cron. Bearer-gated.
 *
 * Skips quietly when an origin has no CrUX data (low-traffic sites).
 * Tolerates per-site errors — a failed site doesn't kill the run.
 */
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/db/client";
import { sites, cwvSnapshots, orgSettings, type NewCwvSnapshot } from "@/db/schema";
import { fetchCruxHistory, toCls } from "@/lib/crux";
import { decrypt } from "@/lib/crypto";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const secret = process.env.GYL_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "GYL_CRON_SECRET not configured" }, { status: 500 });
  }
  const header = req.headers.get("authorization") ?? "";
  if (header.replace(/^Bearer\s+/i, "") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const [orgRow] = await db().select({ googleCruxApiKeyCiphertext: orgSettings.googleCruxApiKeyCiphertext }).from(orgSettings).where(sql`${orgSettings.id} = 'singleton'`).limit(1);
  const cruxKey = orgRow?.googleCruxApiKeyCiphertext
    ? decrypt(orgRow.googleCruxApiKeyCiphertext)
    : process.env.GOOGLE_CRUX_API_KEY || undefined;
  if (!cruxKey) {
    return NextResponse.json({ ok: false, error: "crux-key-not-configured" }, { status: 500 });
  }

  const allSites = await db().select({ id: sites.id, domain: sites.domain, slug: sites.slug }).from(sites);

  const summary: Array<{ slug: string; domain: string; pulled: number; skipped?: boolean; error?: string }> = [];

  for (const s of allSites) {
    const origin = `https://${s.domain}`;
    const perSite = { slug: s.slug, domain: s.domain, pulled: 0 } as typeof summary[number];
    try {
      for (const formFactor of ["PHONE", "DESKTOP"] as const) {
        const records = await fetchCruxHistory({ origin, formFactor, apiKey: cruxKey });
        if (!records) {
          continue;
        }
        for (const r of records) {
          const row: NewCwvSnapshot = {
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
            .values(row)
            .onConflictDoUpdate({
              target: [cwvSnapshots.siteId, cwvSnapshots.snapshotDate, cwvSnapshots.formFactor],
              set: {
                lcpP75: row.lcpP75,
                inpP75: row.inpP75,
                clsP75x1000: row.clsP75x1000,
                fcpP75: row.fcpP75,
                ttfbP75: row.ttfbP75,
                raw: row.raw,
              },
            });
          perSite.pulled++;
        }
      }
      if (perSite.pulled === 0) perSite.skipped = true;
    } catch (e) {
      perSite.error = (e as Error).message.slice(0, 200);
    }
    summary.push(perSite);
  }

  return NextResponse.json({ ok: true, sites: summary.length, summary });
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
