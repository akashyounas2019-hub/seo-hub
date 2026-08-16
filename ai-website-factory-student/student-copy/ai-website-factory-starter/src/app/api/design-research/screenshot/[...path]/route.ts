import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ensureSchema } from "@/db/client";
import { screenshotAbsolutePath } from "@/lib/design-capture";
import { requireUser } from "@/lib/server-auth";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";

/**
 * Serves a stored design-research screenshot (full-page or per-section).
 *
 * Auth: admin-only — reference-site captures can carry competitor page
 * content. The catch-all `[...path]` segments are the DB-stored relative
 * path (`<runId>/<siteId>/full.png`, `<runId>/<siteId>/section-N.png`).
 *
 * Traversal is guarded by `screenshotAbsolutePath()` (rejects any `..`
 * segment); 404 when the file is missing. Cached private-immutable since
 * capture paths are deterministic.
 *
 * Path: /api/design-research/screenshot/<runId>/<siteId>/<file>.png
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  await ensureSchema();
  // The Mac worker reads these screenshots to run Claude Code vision ($0 path),
  // so accept the worker bearer secret in addition to an admin session cookie.
  const workerOk = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!workerOk) {
    const user = await requireUser();
    if (user.role !== "admin") {
      return NextResponse.json({ error: "admin-only" }, { status: 403 });
    }
  }

  const segments = (params.path ?? []).map((s) => decodeURIComponent(s));
  if (segments.length === 0) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const relativePath = segments.join("/");

  let abs: string;
  try {
    abs = screenshotAbsolutePath(relativePath);
  } catch {
    // Path contained a traversal segment.
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!existsSync(abs)) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const buf = await readFile(abs);
  const st = await stat(abs);

  return new NextResponse(buf, {
    headers: {
      "content-type": "image/png",
      "content-length": String(st.size),
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
