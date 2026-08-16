import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { eq, and } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { buildResearchScreenshots } from "@/db/schema";
import { captureStoragePath } from "@/lib/build-screenshot-capture";
import { requireUser } from "@/lib/server-auth";

/**
 * Serves a captured competitor screenshot for a build project.
 *
 * Auth: admin-only (these can contain customer data on competitor pages).
 * Caching: 24h public, immutable hash — file paths are deterministic so
 * the same URL always returns the same PNG.
 *
 * Path: /api/build/screenshots/[projectId]/[hostname]
 *   e.g. /api/build/screenshots/457dba51.../empirecls.com
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string; hostname: string } },
) {
  await ensureSchema();
  const user = await requireUser();
  if (user.role !== "admin") {
    return NextResponse.json({ error: "admin-only" }, { status: 403 });
  }

  const projectId = decodeURIComponent(params.projectId);
  const hostname = decodeURIComponent(params.hostname);

  // Verify we have a captured row for this combination
  const [row] = await db()
    .select()
    .from(buildResearchScreenshots)
    .where(
      and(
        eq(buildResearchScreenshots.projectId, projectId),
        eq(buildResearchScreenshots.hostname, hostname),
      ),
    )
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  if (row.status !== "captured") {
    return NextResponse.json(
      { error: row.status === "pending" ? "pending" : "failed", message: row.error },
      { status: row.status === "pending" ? 202 : 410 },
    );
  }

  const fullPath = captureStoragePath(projectId, hostname);
  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: "file-missing" }, { status: 410 });
  }

  const buf = await readFile(fullPath);
  const st = await stat(fullPath);

  return new NextResponse(buf, {
    headers: {
      "content-type": "image/png",
      "content-length": String(st.size),
      // 24h cache — file hash + project id make this immutable per capture
      "cache-control": "private, max-age=86400, immutable",
    },
  });
}
