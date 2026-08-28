import { createFileRoute } from "@tanstack/react-router";

/**
 * Queues a real social-profile-link scrape. Manual trigger only (same
 * pattern as every other real-data trigger in this app -- no scheduler
 * exists). Accepts either a Google Business Profile URL or a plain website
 * URL as the crawl target; the worker (social-scraper.mjs) drives real
 * Playwright navigation, not a fake delay.
 */
export const Route = createFileRoute("/api/social/scrape")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites, claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          let body: any = {};
          try {
            body = await request.json();
          } catch {
            /* fallback */
          }

          const { siteId, targetUrl } = body;
          if (!siteId || !targetUrl) {
            return Response.json({ ok: false, error: "siteId and targetUrl are required" }, { status: 400 });
          }

          const [site] = await d.select().from(sites).where(eq(sites.id, siteId)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          const [job] = await d
            .insert(claudeJobs)
            .values({
              kind: "social:scrape",
              title: `Social profile scrape — ${site.name || site.domain}`,
              input: { siteId: site.id, targetUrl },
              priority: "normal",
              preferWorker: "any",
              triggerSource: "social_scrape_manual",
            })
            .returning();

          return Response.json({ ok: true, jobId: job.id });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to start social scrape" }, { status: 500 });
        }
      },
    },
  },
});
