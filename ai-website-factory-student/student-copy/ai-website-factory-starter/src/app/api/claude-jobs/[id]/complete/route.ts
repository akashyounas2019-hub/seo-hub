import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs } from "@/db/schema";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSchema();
  const ok = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    outputMarkdown?: string;
    output?: Record<string, unknown>;
    artifacts?: Array<{ name: string; url?: string; bytes?: number }>;
    tokensInput?: number;
    tokensOutput?: number;
    durationMs?: number;
  };

  await db()
    .update(claudeJobs)
    .set({
      status: "done",
      outputMarkdown: body.outputMarkdown ?? null,
      output: body.output ?? null,
      artifacts: body.artifacts ?? [],
      tokensInput: body.tokensInput ?? null,
      tokensOutput: body.tokensOutput ?? null,
      durationMs: body.durationMs ?? null,
      finishedAt: new Date(),
    })
    .where(eq(claudeJobs.id, params.id));

  // Route build:* job output to site_build_projects / site_build_pages.
  // Non-build jobs are a no-op.
  try {
    const { postProcessJob } = await import("@/lib/build-job-postprocess");
    await postProcessJob(params.id);
  } catch (err) {
    console.warn("[claude-jobs.complete] post-process failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}
