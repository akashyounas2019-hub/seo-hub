/**
 * POST /api/cron/run-indexing
 *
 * Daily indexing sync: sitemap → index-status (GSC if connected) → store →
 * IndexNow submit for not-indexed pages → low-index alerts.
 *
 * Bearer-gated with GYL_CRON_SECRET. ?site=<slug> to run one site.
 *
 * Cron: 0 7 * * *  (after the GSC traffic sync at 6:15 so inspection data is fresh)
 */
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db/client";
import { syncAllSitesIndexing } from "@/lib/indexing/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const secret = process.env.GYL_CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "GYL_CRON_SECRET not configured" }, { status: 500 });
  const header = req.headers.get("authorization") ?? "";
  if (header.replace(/^Bearer\s+/i, "") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const url = new URL(req.url);
  const onlySlug = url.searchParams.get("site") ?? undefined;
  const results = await syncAllSitesIndexing(onlySlug);

  const totals = results.reduce(
    (acc, r) => {
      acc.sitemapUrls += r.sitemapUrls;
      acc.inspected += r.inspected;
      acc.indexed += r.indexed;
      acc.notIndexed += r.notIndexed;
      acc.submitted += r.submitted;
      return acc;
    },
    { sitemapUrls: 0, inspected: 0, indexed: 0, notIndexed: 0, submitted: 0 },
  );

  return NextResponse.json({ ok: true, totals, results });
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
