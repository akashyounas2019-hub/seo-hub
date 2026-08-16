/**
 * POST /api/keyword-ranks/ingest
 *
 * Mac worker posts a batch of rank readings for one site after running the
 * track:keyword_ranks job. Body shape:
 *   {
 *     siteId: "uuid",
 *     weekOf: "2026-06-08",   // Monday of the captured week (ISO date)
 *     readings: [
 *       { trackedKeywordId: "uuid", position: 7, url: "https://...", source: "gsc", raw?: {...} },
 *       ...
 *     ]
 *   }
 *
 * Writes one keyword_rank_snapshots row per reading (upsert on (tracked_keyword_id, week_of)).
 * Updates tracked_keywords.last_checked_at + last_position + weeks_off_pN counters.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { keywordRankSnapshots, trackedKeywords } from "@/db/schema";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.GYL_WORKER_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Reading = {
  trackedKeywordId: string;
  position: number | null;
  url?: string | null;
  source: "gsc" | "scrape";
  raw?: unknown;
};

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  let body: { siteId?: string; weekOf?: string; readings?: Reading[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 }); }

  if (!body.siteId || !body.weekOf || !Array.isArray(body.readings)) {
    return NextResponse.json({ ok: false, error: "bad-body" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.weekOf)) {
    return NextResponse.json({ ok: false, error: "bad-weekOf" }, { status: 400 });
  }

  let written = 0;
  for (const r of body.readings) {
    if (!r.trackedKeywordId) continue;
    await db().insert(keywordRankSnapshots).values({
      trackedKeywordId: r.trackedKeywordId,
      siteId: body.siteId,
      weekOf: body.weekOf,
      position: r.position == null ? null : String(r.position),
      url: r.url ?? null,
      source: r.source,
      raw: (r.raw ?? null) as never,
    }).onConflictDoUpdate({
      target: [keywordRankSnapshots.trackedKeywordId, keywordRankSnapshots.weekOf],
      set: {
        position: r.position == null ? null : String(r.position),
        url: r.url ?? null,
        source: r.source,
        raw: (r.raw ?? null) as never,
        capturedAt: new Date(),
      },
    });

    const pos = r.position;
    await db().update(trackedKeywords).set({
      lastCheckedAt: new Date(),
      lastPosition: pos == null ? null : String(pos),
      weeksOffP1: sql`CASE WHEN ${pos ?? 999} <= 10 THEN 0 ELSE weeks_off_p1 + 1 END`,
      weeksOffP2: sql`CASE WHEN ${pos ?? 999} <= 20 THEN 0 ELSE weeks_off_p2 + 1 END`,
      weeksOffP3: sql`CASE WHEN ${pos ?? 999} <= 30 THEN 0 ELSE weeks_off_p3 + 1 END`,
    }).where(eq(trackedKeywords.id, r.trackedKeywordId));
    written++;
  }

  return NextResponse.json({ ok: true, written });
}
