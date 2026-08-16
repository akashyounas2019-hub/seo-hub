/**
 * Cron-driven uptime check. Hits /api/health and either:
 *   - exits 0 on success (cron stays quiet)
 *   - exits 1 on failure AND drops a notification for every admin
 *
 * Wire it up in /etc/cron.d/gyl-health:
 *   * /5 * * * *  gyl  /usr/bin/curl -fsS http://localhost:3001/api/health > /dev/null || /home/gyl/gyl-platform/node_modules/.bin/tsx /home/gyl/gyl-platform/src/scripts/health-check.ts
 *
 * Or for a richer detail report, just run this directly every 5 minutes:
 *   * /5 * * * *  gyl  cd /home/gyl/gyl-platform && /usr/bin/node --env-file=.env.production --import tsx src/scripts/health-check.ts
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { notifications, users } from "../db/schema";
import { runHealthProbes } from "../lib/health";

async function main() {
  await ensureSchema();
  const result = await runHealthProbes();
  console.log(JSON.stringify({ ok: result.ok, probes: result.probes, driver: result.driver }));

  if (!result.ok) {
    // Notify every admin
    const admins = await db().select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    const failingProbes = result.probes.filter((p) => !p.ok);
    const body = failingProbes
      .map((p) => `- ${p.name} (${p.elapsed_ms}ms): ${JSON.stringify(p.detail ?? {})}`)
      .join("\n");

    for (const admin of admins) {
      await db().insert(notifications).values({
        recipientId: admin.id,
        kind: "health_alert",
        title: `🚨 Health check failed: ${failingProbes.map((p) => p.name).join(", ")}`,
        body: `${failingProbes.length} of ${result.probes.length} probes failed at ${new Date().toISOString()}.\n\n${body}`,
        link: "/admin/notifications",
      });
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[health-check] fatal", err);
  // Even meta-failures get a notification
  try {
    await ensureSchema();
    const admins = await db().select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    for (const admin of admins) {
      await db().insert(notifications).values({
        recipientId: admin.id,
        kind: "health_alert",
        title: "🚨 Health check itself crashed",
        body: err instanceof Error ? `${err.message}\n\n${err.stack ?? ""}` : String(err),
        link: "/admin/notifications",
      });
    }
  } catch {}
  process.exit(2);
});
