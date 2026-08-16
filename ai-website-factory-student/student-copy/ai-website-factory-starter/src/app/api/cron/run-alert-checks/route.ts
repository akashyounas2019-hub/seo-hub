/**
 * POST /api/cron/run-alert-checks
 *
 * Fires the alert check engine. Designed for a 15-minute external cron
 * (system cron on the VPS or any external scheduler). Authenticated by a
 * shared bearer in the GYL_CRON_SECRET env so it can't be poked publicly.
 *
 * Query params:
 *   ?only=kind1,kind2   — run only specific check kinds (useful for ad-hoc)
 *
 * Response: { ok, durationMs, perCheck: [...] }
 */
import { NextResponse } from "next/server";
import { ensureSchema } from "@/db/client";
import { runChecks } from "@/lib/alerts/check-engine";
import { checksFor } from "@/lib/alerts/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const secret = process.env.GYL_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "GYL_CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const url = new URL(req.url);
  const only = url.searchParams.get("only")?.split(",").filter(Boolean) ?? null;
  const checks = checksFor(only);
  if (checks.length === 0) {
    return NextResponse.json({ ok: false, error: "no-checks-matched", asked: only }, { status: 400 });
  }

  const result = await runChecks(checks);
  return NextResponse.json({
    ok: true,
    durationMs: result.durationMs,
    hadError: result.hadError,
    perCheck: result.perCheck,
  });
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request) { return handle(req); }
