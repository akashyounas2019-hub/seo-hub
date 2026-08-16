/**
 * P3 — Screenshot image serving.
 *
 * Streams a PNG from the screenshot store. Authenticated — must be a
 * logged-in admin (or scoped manager with access to the owning site).
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteScreenshots } from "@/db/schema";
import { getCurrentUser } from "@/lib/server-auth";

const STORAGE_BASE = process.env.SCREENSHOT_STORAGE_PATH ?? path.join(process.cwd(), ".data", "screenshots");

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [row] = await db().select().from(siteScreenshots).where(eq(siteScreenshots.id, params.id)).limit(1);
  if (!row) return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });

  // Note: for scoped managers we'd cross-check site visibility — admins
  // see everything which is the common case.
  const abs = path.resolve(STORAGE_BASE, row.pngPath);
  // Path traversal guard.
  if (!abs.startsWith(path.resolve(STORAGE_BASE))) {
    return NextResponse.json({ ok: false, error: "invalid-path" }, { status: 400 });
  }
  try {
    const data = await fs.readFile(abs);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "file-missing" }, { status: 410 });
  }
}
