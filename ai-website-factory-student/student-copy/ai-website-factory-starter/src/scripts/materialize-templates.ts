/**
 * Materialize recurring task_templates → tasks.
 *
 * Walks every `active=true` template and, if its cadence indicates it's due
 * (based on `last_run_at` vs now), inserts a new `tasks` row using the
 * template defaults and stamps `last_run_at`.
 *
 * Cadence dialect (intentionally tiny):
 *   - "weekly"          → 7 days
 *   - "monthly"         → 30 days (approx, good enough for ops cadence)
 *   - "every N days"    → N days
 *   - "every N weeks"   → N * 7 days
 *
 * Suggested cron: `0 6 * * *` (daily at 06:00 server time).
 */

import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { taskTemplates, tasks } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";

const DAY_MS = 24 * 60 * 60 * 1000;

function cadenceToMs(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (s === "weekly") return 7 * DAY_MS;
  if (s === "monthly") return 30 * DAY_MS;
  const daysMatch = s.match(/^every\s+(\d+)\s+day(s)?$/);
  if (daysMatch) return Number(daysMatch[1]) * DAY_MS;
  const weeksMatch = s.match(/^every\s+(\d+)\s+week(s)?$/);
  if (weeksMatch) return Number(weeksMatch[1]) * 7 * DAY_MS;
  return null;
}

async function main() {
  await ensureSchema();
  const now = new Date();
  const all = await db().select().from(taskTemplates).where(eq(taskTemplates.active, true));

  let created = 0;
  let skipped = 0;
  let badCadence = 0;
  let missingSite = 0;

  for (const tmpl of all) {
    const intervalMs = cadenceToMs(tmpl.cadence);
    if (intervalMs == null) {
      badCadence++;
      console.warn(`[materialize] template "${tmpl.title}" (${tmpl.id}) — unknown cadence "${tmpl.cadence}"`);
      continue;
    }
    const due =
      !tmpl.lastRunAt || now.getTime() - new Date(tmpl.lastRunAt).getTime() >= intervalMs;
    if (!due) {
      skipped++;
      continue;
    }
    if (!tmpl.siteId) {
      missingSite++;
      console.warn(`[materialize] template "${tmpl.title}" (${tmpl.id}) skipped — no siteId`);
      continue;
    }

    const [task] = await db()
      .insert(tasks)
      .values({
        siteId: tmpl.siteId,
        title: tmpl.title,
        description: tmpl.description,
        priority: tmpl.defaultPriority,
        assigneeId: tmpl.defaultAssigneeId,
        templateId: tmpl.id,
      })
      .returning({ id: tasks.id });

    await db()
      .update(taskTemplates)
      .set({ lastRunAt: now })
      .where(eq(taskTemplates.id, tmpl.id));

    await recordAdminAction({
      actor: null,
      kind: "template.run",
      targetType: "template",
      targetId: tmpl.id,
      summary: `Auto-materialized "${tmpl.title}" → task ${task?.id}`,
      after: { taskId: task?.id, cadence: tmpl.cadence },
    });

    created++;
    console.log(`[materialize] ${tmpl.title} → task ${task?.id}`);
  }

  console.log(
    `[materialize] done. created=${created} skipped=${skipped} bad_cadence=${badCadence} missing_site=${missingSite}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[materialize] failed", err);
    process.exit(1);
  });
