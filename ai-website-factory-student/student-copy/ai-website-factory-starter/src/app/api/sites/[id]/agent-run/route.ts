/**
 * Manual-trigger endpoint — queues an seo_audits row so the next cron
 * tick picks it up. (We don't fork a Node process from inside Next.js;
 * the gyl-cron container does the work.)
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { seoAudits, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KINDS = new Set([
  "alt_text", "on_page", "content_quality", "competitor",
  "accessibility", "image_opt", "local_seo", "core_web_vitals",
  "security", "visual_design", "ui_ux", "backlinks", "technical", "content_gap",
]);

export async function POST(req: Request, ctx: { params: { id: string } }): Promise<NextResponse> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteId = ctx.params.id;

  const [site] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return NextResponse.json({ ok: false, error: "site-not-found" }, { status: 404 });

  let body: { kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }
  const kind = String(body.kind ?? "");
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "bad-kind" }, { status: 400 });
  }

  const [audit] = await db()
    .insert(seoAudits)
    .values({
      siteId,
      kind: kind as "alt_text",  // enum cast — VALID_KINDS keeps this safe
      status: "queued",
      trigger: "manual",
      triggeredBy: me.id,
    })
    .returning({ id: seoAudits.id });

  await recordAdminAction({
    actor: me,
    kind: "site.agent_run_queued",
    targetType: "site",
    targetId: siteId,
    summary: `Manual ${kind} scan queued for ${site.name}.`,
  });

  return NextResponse.json({
    ok: true,
    auditId: audit?.id,
    message: `${kind} scan queued. Will run on the next cron tick (within an hour).`,
  });
}
