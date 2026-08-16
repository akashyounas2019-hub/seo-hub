/**
 * Per-site agent policy toggle — flips a single capability between
 * auto/propose/off. Used by the AgentPanel slide-over.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { seoPolicies } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import { requireAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCKED = new Set(["visual_css"]);
const VALID = new Set(["auto", "propose", "off"]);

export async function POST(req: Request, ctx: { params: { id: string } }): Promise<NextResponse> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteId = ctx.params.id;

  let body: { key?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-json" }, { status: 400 });
  }
  const key = String(body.key ?? "");
  const mode = String(body.mode ?? "");
  if (!key || !VALID.has(mode)) {
    return NextResponse.json({ ok: false, error: "bad-input" }, { status: 400 });
  }
  if (LOCKED.has(key)) {
    return NextResponse.json({ ok: false, error: "capability-locked" }, { status: 400 });
  }

  // Read-modify-write the capabilities map.
  const [policy] = await db().select().from(seoPolicies).where(eq(seoPolicies.siteId, siteId)).limit(1);
  const current = policy?.capabilities ?? {};
  const next = { ...current, [key]: mode as "auto" | "propose" | "off" };

  await db()
    .insert(seoPolicies)
    .values({ siteId, capabilities: next, enabled: true })
    .onConflictDoUpdate({
      target: seoPolicies.siteId,
      set: { capabilities: next, updatedAt: new Date() },
    });

  await recordAdminAction({
    actor: me,
    kind: "site.agent_policy_toggle",
    targetType: "site",
    targetId: siteId,
    summary: `Set ${key} → ${mode}`,
    before: { [key]: current[key] ?? "default" },
    after: { [key]: mode },
  });

  return NextResponse.json({ ok: true });
}
