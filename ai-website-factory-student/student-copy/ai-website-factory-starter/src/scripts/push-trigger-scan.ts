/**
 * Push trigger scan — runs every 5 min via cron.
 *
 * 1. detectTriggers() finds high-signal events
 * 2. Filters out anything already pushed today (push_sent log)
 * 3. dispatchTriggers() drops one notify:push job per surviving trigger
 * 4. Records the push_sent row so we don't double-fire
 *
 * Mac worker drains the notify:push queue and sends via Telegram (free).
 */
import { db, ensureSchema } from "../db/client";
import { pushSent } from "../db/schema";
import { detectTriggers, dispatchTriggers } from "../lib/push-triggers";

async function main() {
  await ensureSchema();

  const triggers = await detectTriggers();
  if (triggers.length === 0) {
    console.log("[push-scan] no triggers");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  // Reserve a dedup slot atomically per trigger. INSERT...ON CONFLICT DO
  // NOTHING is the atomic claim — only triggers whose insert actually wrote
  // a row are "fresh" and get dispatched. Eliminates the read-then-write race
  // between parallel cron scans.
  const fresh = [];
  for (const t of triggers) {
    const inserted = await db().insert(pushSent).values({
      kind: t.kind,
      refId: String(t.refId).toLowerCase(), // normalize for stable dedup
      firedOn: today,
    }).onConflictDoNothing({
      target: [pushSent.kind, pushSent.refId, pushSent.firedOn],
    }).returning({ id: pushSent.id });
    if (inserted.length > 0) fresh.push(t);
  }
  if (fresh.length === 0) {
    console.log(`[push-scan] ${triggers.length} triggers, all already pushed today`);
    return;
  }

  const queued = await dispatchTriggers(fresh);
  console.log(`[push-scan] queued ${queued}/${triggers.length} new push(es)`);
}

main().catch((err) => {
  console.error("[push-scan] failed:", err);
  process.exit(1);
});
