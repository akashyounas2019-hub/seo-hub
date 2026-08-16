import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs } from "@/db/schema";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const ok = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { error?: string };
  await db()
    .update(claudeJobs)
    .set({ status: "failed", error: body.error ?? "Worker reported failure", finishedAt: new Date() })
    .where(eq(claudeJobs.id, params.id));
  return NextResponse.json({ ok: true });
}
