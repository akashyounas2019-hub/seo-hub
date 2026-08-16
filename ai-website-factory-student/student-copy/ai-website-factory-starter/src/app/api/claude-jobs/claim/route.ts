/**
 * POST /api/claude-jobs/claim
 *
 * Worker → portal. Worker presents Bearer token. Portal returns the next
 * pending job (or null) and atomically marks it 'claimed' + records the
 * worker_id. Worker has 5 minutes to call /heartbeat or the job goes
 * back to pending.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { claudeJobs, sites } from "@/db/schema";
import { templateByKind } from "@/lib/claude-job-templates";
import { verifyWorkerAuth } from "@/lib/claude-worker-auth";

export async function POST(req: NextRequest) {
  await ensureSchema();
  const ok = await verifyWorkerAuth(req.headers.get("authorization"));
  if (!ok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    workerId?: string;
    workerInfo?: Record<string, unknown>;
    workerKind?: string;  // 'mac' | 'server' — defaults to 'mac' since this endpoint is for the external worker
  };
  const workerId = body.workerId?.trim() || "anonymous";
  const workerKind = (body.workerKind ?? "mac") === "server" ? "server" : "mac";

  // First, reclaim any jobs that were claimed but went stale (no heartbeat in 5 min).
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
  await db()
    .update(claudeJobs)
    .set({ status: "pending", workerId: null, claimedAt: null })
    .where(and(eq(claudeJobs.status, "claimed"), sql`${claudeJobs.claimedAt} < ${fiveMinAgo.toISOString()}::timestamptz`));

  // ROUTING:
  //   - workerKind='mac' (Claude Code on Mac, free via subscription):
  //       prefer 'mac' + 'any' jobs. Won't claim 'server' unless they've
  //       sat 10+ min (stale fallback, very rare).
  //   - workerKind='server' (API): mirror of the server executor — only
  //       'server' + 'any' jobs, plus 'mac' jobs that have sat 5+ min.
  const macStaleCutoff = new Date(Date.now() - 5 * 60_000);
  const serverStaleCutoff = new Date(Date.now() - 10 * 60_000);
  const claimableWhere =
    workerKind === "mac"
      ? sql`(
          ${claudeJobs.preferWorker} IN ('mac', 'any')
          OR (
            ${claudeJobs.preferWorker} = 'server'
            AND ${claudeJobs.createdAt} < ${serverStaleCutoff.toISOString()}::timestamptz
          )
        )`
      : sql`(
          ${claudeJobs.preferWorker} IN ('server', 'any')
          OR (
            ${claudeJobs.preferWorker} = 'mac'
            AND ${claudeJobs.createdAt} < ${macStaleCutoff.toISOString()}::timestamptz
          )
        )`;

  // Atomically claim the highest-priority pending job
  const [next] = await db()
    .select({ id: claudeJobs.id })
    .from(claudeJobs)
    .where(and(eq(claudeJobs.status, "pending"), claimableWhere))
    .orderBy(
      // Mac worker prioritizes 'mac' jobs first (they're explicitly tagged
      // for it), then by priority, then by age.
      workerKind === "mac"
        ? sql`case ${claudeJobs.preferWorker} when 'mac' then 0 when 'any' then 1 else 2 end`
        : sql`case ${claudeJobs.preferWorker} when 'server' then 0 when 'any' then 1 else 2 end`,
      sql`case ${claudeJobs.priority} when 'high' then 0 when 'normal' then 1 else 2 end`,
      asc(claudeJobs.createdAt),
    )
    .limit(1);

  if (!next) {
    return NextResponse.json({ ok: true, job: null });
  }

  const now = new Date();
  const [claimed] = await db()
    .update(claudeJobs)
    .set({
      status: "claimed",
      workerId,
      workerInfo: { ...(body.workerInfo ?? {}), workerKind },
      claimedAt: now,
    })
    .where(and(eq(claudeJobs.id, next.id), eq(claudeJobs.status, "pending")))
    .returning();

  if (!claimed) {
    // Someone else got it
    return NextResponse.json({ ok: true, job: null });
  }

  // Build the prompt + ship metadata + site context
  let siteCtx: { id: string; name: string; slug: string; domain: string; city: string | null; region: string | null } | null = null;
  if (claimed.siteId) {
    const [s] = await db().select().from(sites).where(eq(sites.id, claimed.siteId)).limit(1);
    if (s) siteCtx = { id: s.id, name: s.name, slug: s.slug, domain: s.domain, city: s.city, region: s.region };
  }
  const template = templateByKind(claimed.kind);
  const inputRecord = (claimed.input ?? {}) as Record<string, unknown>;
  // Escape hatch for job kinds that don't have a server-side template — the
  // action that inserts them can bake the prompt into `input.prompt` (Cloud
  // SEO does this). Templates still win when present so this doesn't override
  // the site-context injection they do.
  const inlinePrompt =
    typeof inputRecord.prompt === "string" && inputRecord.prompt.trim().length > 0
      ? inputRecord.prompt
      : null;
  const prompt = template
    ? template.buildPrompt(inputRecord as Record<string, string>, {
        siteName: siteCtx?.name,
        siteUrl: siteCtx ? `https://${siteCtx.domain}` : undefined,
        siteCity: siteCtx?.city ?? undefined,
        siteRegion: siteCtx?.region ?? undefined,
      })
    : (inlinePrompt ??
        "(no template found — worker should ignore this job and call /fail)");

  return NextResponse.json({
    ok: true,
    job: {
      id: claimed.id,
      kind: claimed.kind,
      title: claimed.title,
      prompt,
      input: claimed.input,
      site: siteCtx,
      claimedAt: claimed.claimedAt,
    },
  });
}
