import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/db/client";
import { captureUrlFullPagePng } from "@/lib/design-capture";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";

/**
 * Section Watch — ad-hoc single-URL full-page capture ($0 vision path).
 *
 * The Mac worker POSTs a live page URL; capture runs server-side (where
 * Playwright lives), and the PNG bytes are returned so the worker can run
 * Claude Code vision on them with its subscription (no Anthropic API key).
 * Mirrors the worker-auth + server-side-Playwright architecture of
 * /api/design-research/capture, but URL-based instead of run-based.
 *
 * Body: { url }  →  image/png bytes (200) | { ok:false, error } (4xx/5xx)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureSchema();
  const ok = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  if (!body.url || !/^https?:\/\//i.test(body.url)) {
    return NextResponse.json({ ok: false, error: "missing-or-invalid-url" }, { status: 400 });
  }

  try {
    const png = await captureUrlFullPagePng(body.url);
    if (!png) {
      return NextResponse.json({ ok: false, error: "playwright-unavailable" }, { status: 503 });
    }
    return new NextResponse(png as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg.slice(0, 500) }, { status: 500 });
  }
}
