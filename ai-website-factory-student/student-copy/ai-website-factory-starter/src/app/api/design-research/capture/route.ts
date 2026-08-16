import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/db/client";
import { captureRunSections } from "@/lib/design-capture";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";

/**
 * Worker-driven Playwright capture for a design-research run.
 *
 * The Mac worker claims a `research:capture_sections` job and POSTs here.
 * Capture runs server-side (where the DB + screenshot storage + Playwright
 * live), the same architecture as `audit:network_health` → `/api/health/
 * ingest-run`. No LLM / no Anthropic API.
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const ok = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { runId?: string; force?: boolean };
  if (!body.runId) {
    return NextResponse.json({ ok: false, error: "missing-run-id" }, { status: 400 });
  }

  try {
    const result = await captureRunSections(body.runId, { force: body.force === true });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg.slice(0, 500) }, { status: 500 });
  }
}
