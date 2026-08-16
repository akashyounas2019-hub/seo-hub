/**
 * POST /api/health/ingest-run
 *
 * Accepts the JSON output of a gyl-network-health orchestrator run from the
 * Mac worker. Body shape:
 *   {
 *     runDate: "2026-06-11",
 *     matrix: [...]            // contents of health-matrix-<date>.json
 *     perSite: {<slug>: {structure?: ..., design?: ..., onpage?: ..., indexing?: ...}}
 *                              // per-skill JSON for each site keyed by slug
 *   }
 *
 * Auth: shared GYL_WORKER_SECRET header (the same one the Mac worker uses for
 * claude_jobs), so a stolen platform credential alone can't push fake audits.
 */
import { NextRequest, NextResponse } from "next/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureSchema } from "@/db/client";
import { importNetworkHealthRun } from "@/lib/health-audit-import";

const HOME = process.env.HOME ?? "/root";
const NETWORK_DIR = resolve(HOME, "gyl-sites", "_network");

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.GYL_WORKER_SECRET;
  if (!secret) return false;
  const got = req.headers.get("authorization");
  return got === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchema();

  let body: { runDate?: string; matrix?: unknown; perSite?: Record<string, unknown> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 }); }

  if (!body.runDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.runDate)) {
    return NextResponse.json({ ok: false, error: "bad-runDate" }, { status: 400 });
  }
  if (!Array.isArray(body.matrix)) {
    return NextResponse.json({ ok: false, error: "bad-matrix" }, { status: 400 });
  }

  // Stage the JSON to disk so importNetworkHealthRun (which reads from disk)
  // can consume it. This deliberately matches what the Mac orchestrator would
  // have written, so the importer code path is identical regardless of source.
  mkdirSync(NETWORK_DIR, { recursive: true });
  writeFileSync(
    resolve(NETWORK_DIR, `health-matrix-${body.runDate}.json`),
    JSON.stringify(body.matrix, null, 2),
  );

  // Stage per-site files (4 JSON blobs per site under audit subdir).
  if (body.perSite && typeof body.perSite === "object") {
    for (const [slug, perSite] of Object.entries(body.perSite)) {
      if (!perSite || typeof perSite !== "object") continue;
      const data = perSite as Record<string, unknown>;
      const dirs = {
        structure: resolve(HOME, "gyl-sites", slug, "audits", `structure-audit-${body.runDate}`),
        design: resolve(HOME, "gyl-sites", slug, "audits", `design-audit-${body.runDate}`),
        seo: resolve(HOME, "gyl-sites", slug, "audits", `seo-audit-${body.runDate}`),
      };
      for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
      const writeIf = (path: string, value: unknown) => {
        if (value === undefined) return;
        writeFileSync(path, JSON.stringify(value, null, 2));
      };
      writeIf(resolve(dirs.structure, "inventory.json"), data.inventory);
      writeIf(resolve(dirs.design, "chrome-parity.json"), data.chromeParity);
      writeIf(resolve(dirs.design, "mobile-sweep.json"), data.mobileSweep);
      writeIf(resolve(dirs.design, "hero-uniqueness.json"), data.heroUniqueness);
      writeIf(resolve(dirs.seo, "onpage.json"), data.onpage);
      writeIf(resolve(dirs.seo, "index.json"), data.indexAudit);
    }
  }

  const result = await importNetworkHealthRun({ runDate: body.runDate });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sites: result.sitesImported, issues: result.issuesImported });
}
