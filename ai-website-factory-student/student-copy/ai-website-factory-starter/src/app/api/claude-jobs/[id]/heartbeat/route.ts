import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs } from "@/db/schema";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const ok = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // Touch claimedAt so the stale-claim sweeper doesn't reclaim us. Also
  // promote to 'running' if this is the first heartbeat after claim.
  const now = new Date();
  await db()
    .update(claudeJobs)
    .set({
      status: "running",
      claimedAt: now,
      // Only set startedAt the first time
    })
    .where(
      and(
        eq(claudeJobs.id, params.id),
        or(eq(claudeJobs.status, "claimed"), eq(claudeJobs.status, "running")),
        isNull(claudeJobs.finishedAt),
      ),
    );
  // Set startedAt if not already
  await db()
    .update(claudeJobs)
    .set({ startedAt: now })
    .where(and(eq(claudeJobs.id, params.id), isNull(claudeJobs.startedAt)));

  return NextResponse.json({ ok: true });
}
