import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { ensureSchema, db } from "@/db/client";
import { designReferenceSections, designReferenceSites } from "@/db/schema";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";
import { parseSections } from "@/lib/design-vision";

/**
 * Worker-driven VISION ingest for a design-research site ($0 path).
 *
 * The Mac worker reads each full-page screenshot with Claude Code (its
 * subscription — no Anthropic API key), then POSTs the model's raw JSON output
 * here. We validate it through the SAME `parseSections` used by the server-side
 * vision path, then replace this site's sections with `source:'vision-mac'`
 * rows that reference the stored full screenshot + a y-band (the gallery
 * CSS-clips). Mirrors the audit:network_health → ingest pattern.
 *
 * Body: { runId, siteId, raw }  (raw = Claude Code's text output, JSON array)
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const ok = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    runId?: string;
    siteId?: string;
    raw?: string;
  };
  if (!body.runId || !body.siteId || typeof body.raw !== "string") {
    return NextResponse.json({ ok: false, error: "missing-run-site-or-raw" }, { status: 400 });
  }

  const sections = parseSections(body.raw);
  if (!sections || !sections.length) {
    return NextResponse.json({ ok: false, error: "no-valid-sections" }, { status: 422 });
  }

  // The full-page screenshot path is deterministic (matches relPath() in
  // design-capture.ts); the gallery clips it to each band's y-range.
  const fullRel = `${body.runId}/${body.siteId}/full.png`;

  // Replace any existing sections for this site (idempotent on re-run).
  await db().delete(designReferenceSections).where(eq(designReferenceSections.siteId, body.siteId));

  for (let i = 0; i < sections.length; i++) {
    const v = sections[i];
    await db().insert(designReferenceSections).values({
      siteId: body.siteId,
      sectionType: v.type,
      label: v.label || v.type,
      order: i,
      screenshotPath: fullRel,
      domSummary: null,
      boundingBox: null,
      source: "vision-mac",
      yStartPct: v.yStartPct,
      yEndPct: v.yEndPct,
      isValid: v.isValid,
      validationNote: v.note ?? null,
    });
  }

  await db()
    .update(designReferenceSites)
    .set({ status: "captured", fullScreenshotPath: fullRel })
    .where(eq(designReferenceSites.id, body.siteId));

  const valid = sections.filter((s) => s.isValid !== false).length;
  return NextResponse.json({ ok: true, sections: sections.length, valid });
}
