/**
 * Fire due agent_schedules → claude_jobs.
 *
 * Reads every `agent_schedules` row whose next_fire_at <= now and enabled=true,
 * inserts one `claude_jobs` row per schedule with kind='agent_task',
 * triggerSource='scheduled', and the agent persona snapshot in `input`.
 * Advances next_fire_at based on the recurrence.
 *
 *   Stop the dev server first (PGlite is single-writer), then:
 *     npm run agent:schedules:tick
 *
 * Wire this into cron (Task Scheduler / launchd / server crontab) to fire
 * every 1–5 minutes.
 */
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { agentProfiles, agentSchedules, claudeJobs, sites } from "../db/schema";
import { TASK_TYPES } from "../lib/agent-roster";

function nextFire(current: Date, recurrence: string): Date | null {
  const ms = current.getTime();
  switch (recurrence) {
    case "daily":   return new Date(ms + 24 * 3600_000);
    case "weekly":  return new Date(ms + 7 * 24 * 3600_000);
    case "monthly": {
      const d = new Date(current);
      d.setMonth(d.getMonth() + 1);
      return d;
    }
    case "once":
    default:
      return null;
  }
}

async function main() {
  await ensureSchema();
  const now = new Date();

  const due = await db()
    .select()
    .from(agentSchedules)
    .where(and(
      eq(agentSchedules.enabled, true),
      isNotNull(agentSchedules.nextFireAt),
      lte(agentSchedules.nextFireAt, now),
    ));

  if (due.length === 0) {
    console.log(`[schedules] nothing due at ${now.toISOString()}`);
    return;
  }

  let fired = 0;
  let failed = 0;

  for (const s of due) {
    try {
      const [persona] = await db()
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, s.agentId))
        .limit(1);
      if (!persona) {
        console.warn(`[schedules] skip ${s.id} — agent ${s.agentId} not found`);
        continue;
      }
      if (!persona.isActive) {
        console.warn(`[schedules] skip ${s.id} — agent ${s.agentId} is OFF`);
        // Still advance next_fire_at so we don't hammer.
        const next = nextFire(s.nextFireAt, s.recurrence);
        await db()
          .update(agentSchedules)
          .set({ nextFireAt: next ?? s.nextFireAt, updatedAt: new Date() })
          .where(eq(agentSchedules.id, s.id));
        continue;
      }

      const type = TASK_TYPES.find((t) => t.id === s.taskType);
      const label = type?.label ?? s.taskType;
      const description = type?.description ?? "";

      let siteName: string | null = null;
      if (s.siteId) {
        const [site] = await db()
          .select({ name: sites.name })
          .from(sites)
          .where(eq(sites.id, s.siteId))
          .limit(1);
        siteName = site?.name ?? null;
      }

      const title = siteName
        ? `${s.title} — ${siteName} (${persona.name})`
        : `${s.title} — ${persona.name}`;

      const [created] = await db()
        .insert(claudeJobs)
        .values({
          kind: "agent_task",
          title,
          siteId: s.siteId,
          status: "pending",
          priority: "normal",
          preferWorker: "mac",
          triggerSource: "scheduled",
          input: {
            agentId: persona.id,
            agentName: persona.name,
            agentTitle: persona.title,
            skillInstructions: persona.skillInstructions ?? "",
            taskTypeId: s.taskType,
            taskTypeLabel: label,
            taskTypeDescription: description,
            instructions: s.instructions ?? null,
            triggerSource: "scheduled",
            scheduleId: s.id,
          },
        })
        .returning({ id: claudeJobs.id });

      const next = nextFire(s.nextFireAt, s.recurrence);
      await db()
        .update(agentSchedules)
        .set({
          lastFireAt: now,
          lastJobId: created.id,
          fireCount: s.fireCount + 1,
          nextFireAt: next ?? s.nextFireAt,
          enabled: next ? true : false,   // 'once' schedules retire after first fire
          updatedAt: new Date(),
        })
        .where(eq(agentSchedules.id, s.id));

      console.log(`[schedules] fired ${s.id} — ${title} → job ${created.id}`);
      fired += 1;
    } catch (err) {
      console.error(`[schedules] failed ${s.id}:`, err);
      failed += 1;
    }
  }

  console.log(`[schedules] done — fired ${fired}, failed ${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
