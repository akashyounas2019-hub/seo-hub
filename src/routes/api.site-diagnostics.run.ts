import { createFileRoute } from "@tanstack/react-router";
import { runAndStoreDiagnostics } from "./api.sites.$id.issues";

/**
 * Daily automated technical diagnostics agent. Runs the exact same real PSI
 * + robots.txt/sitemap/HTTPS checks the Issues tab's manual "Re-check"
 * button runs (runAndStoreDiagnostics, shared with api.sites.$id.issues.ts
 * so there's one real check implementation, not a duplicated one), caches
 * the result to site_diagnostics_reports, and raises a real alert in the
 * Alert Manager (alerts table) for every critical issue found -- so a
 * technical problem surfaces both in Settings > Issues and in Alerts
 * without the user needing to open the dashboard.
 *
 * Triggered by the AKS worker (worker/aks-worker.mjs) once a site is due
 * per api.site-diagnostics.due-sites.ts's 24h check -- same architecture as
 * the existing Head of SEO orchestrator's due-sites/run pair.
 */
export const Route = createFileRoute("/api/site-diagnostics/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }
          const siteId = body.siteId as string;
          if (!siteId) {
            return Response.json({ ok: false, error: "siteId is required" }, { status: 400 });
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { sites, alerts } = await import("@/db/schema");
          const { eq, and } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [site] = await d.select().from(sites).where(eq(sites.id, siteId)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          const strategy: "mobile" | "desktop" = "mobile";
          const result = await runAndStoreDiagnostics(site.id, site.domain, strategy, "daily-auto");

          const allIssues = [...result.technicalIssues, ...result.pageSpeedIssues];
          const criticalIssues = allIssues.filter((i) => i.severity === "critical");

          let alertsCreated = 0;
          for (const issue of criticalIssues) {
            // Dedupe against any still-open alert for this exact issue on
            // this site -- a persisting problem shouldn't spawn a fresh
            // alert every single day, only the first time it's seen and
            // again if it was resolved and then reappears.
            const [existingOpen] = await d
              .select({ id: alerts.id })
              .from(alerts)
              .where(and(eq(alerts.siteId, site.id), eq(alerts.title, issue.title as string), eq(alerts.status, "open")))
              .limit(1);
            if (existingOpen) continue;

            await d.insert(alerts).values({
              siteId: site.id,
              severity: "critical",
              title: issue.title as string,
              message: (issue.description as string) || null,
              source: "site-diagnostics",
              status: "open",
            });
            alertsCreated++;
          }

          if (result.pageSpeedError) {
            const [existingOpen] = await d
              .select({ id: alerts.id })
              .from(alerts)
              .where(and(eq(alerts.siteId, site.id), eq(alerts.title, "PageSpeed Insights check failed"), eq(alerts.status, "open")))
              .limit(1);
            if (!existingOpen) {
              await d.insert(alerts).values({
                siteId: site.id,
                severity: "warning",
                title: "PageSpeed Insights check failed",
                message: result.pageSpeedError,
                source: "site-diagnostics",
                status: "open",
              });
              alertsCreated++;
            }
          }

          return Response.json({
            ok: true,
            siteId: site.id,
            criticalCount: criticalIssues.length,
            warningCount: allIssues.length - criticalIssues.length,
            alertsCreated,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to run diagnostics" }, { status: 500 });
        }
      },
    },
  },
});
