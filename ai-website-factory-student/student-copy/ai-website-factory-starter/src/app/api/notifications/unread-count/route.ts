import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { notifications } from "@/db/schema";
import { withErrorTracking } from "@/lib/error-tracking";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGet() {
  await ensureSchema();
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.recipientId, me.id), isNull(notifications.readAt)));

  return NextResponse.json(
    { ok: true, unread: row?.n ?? 0 },
    { headers: { "Cache-Control": "private, max-age=0, no-store" } },
  );
}

export const GET = withErrorTracking("notifications.unread-count", handleGet);
