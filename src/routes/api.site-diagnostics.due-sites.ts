import { createFileRoute } from "@tanstack/react-router";

// Runs once per site per calendar day, at/after a specific target hour
// (UTC, server clock) rather than a rolling "24h since last run" window --
// a rolling window drifts later every day the worker happens to be a few
// minutes late, so "daily at a specific time" wouldn't actually hold.
// Configurable via AKS_DIAGNOSTICS_HOUR_UTC; defaults to 03:00 UTC, a
// low-traffic time for most audiences this app targets (Dubai/GCC daytime
// traffic has fully wound down by then).
const TARGET_HOUR_UTC = Number(process.env.AKS_DIAGNOSTICS_HOUR_UTC ?? 3);

function isDue(lastCheckedAt: Date | null): boolean {
  const now = new Date();
  if (now.getUTCHours() < TARGET_HOUR_UTC) return false; // today's window hasn't opened yet
  if (!lastCheckedAt) return true; // never checked -- due as soon as the window opens
  const sameCalendarDay =
    lastCheckedAt.getUTCFullYear() === now.getUTCFullYear() &&
    lastCheckedAt.getUTCMonth() === now.getUTCMonth() &&
    lastCheckedAt.getUTCDate() === now.getUTCDate();
  return !sameCalendarDay || lastCheckedAt.getUTCHours() < TARGET_HOUR_UTC;
}

/**
 * Real daily-at-a-specific-time auto-trigger check for the technical
 * diagnostics agent (api.site-diagnostics.run.ts), mirroring
 * api.orchestrator.due-sites.ts's architecture: the AKS worker
 * (worker/aks-worker.mjs), already running 24/7 under pm2, polls this on
 * every idle cycle and runs the check itself for any site that's due.
 * "Due" is computed honestly from the real site_diagnostics_reports.
 * checked_at timestamp for that site (or "never checked" if no row exists
 * yet) -- the exact same row the Issues tab reads, so there's no separate
 * last-run tracker that could drift from reality.
 */
export const Route = createFileRoute("/api/site-diagnostics/due-sites")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites, siteDiagnosticsReports } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const allSites = await d.select().from(sites);
          const due: { siteId: string; siteName: string; lastCheckedAt: string | null }[] = [];

          for (const site of allSites) {
            const [lastReport] = await d
              .select({ checkedAt: siteDiagnosticsReports.checkedAt })
              .from(siteDiagnosticsReports)
              .where(eq(siteDiagnosticsReports.siteId, site.id))
              .limit(1);

            const lastCheckedAt = lastReport?.checkedAt ? new Date(lastReport.checkedAt) : null;

            if (isDue(lastCheckedAt)) {
              due.push({ siteId: site.id, siteName: site.name, lastCheckedAt: lastCheckedAt?.toISOString() ?? null });
            }
          }

          return Response.json({ ok: true, due, targetHourUtc: TARGET_HOUR_UTC });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to check due sites" }, { status: 500 });
        }
      },
    },
  },
});
