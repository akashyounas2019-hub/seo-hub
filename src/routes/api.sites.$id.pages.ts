import { createFileRoute } from "@tanstack/react-router";
import { crawlSitemap } from "@/lib/sitemap-crawler";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/sites/$id/pages")({
  server: {
    handlers: {
      // Returns the last-crawled inventory from Postgres -- no network call,
      // safe to load on every Site Pages tab visit.
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sitePages } = await import("@/db/schema");
          const { eq, asc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const pages = await d
            .select()
            .from(sitePages)
            .where(eq(sitePages.siteId, params.id))
            .orderBy(asc(sitePages.url));

          return Response.json({
            ok: true,
            pages,
            count: pages.length,
            lastCrawledAt: pages[0]?.lastCrawledAt || null,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load site pages" }, { status: 500 });
        }
      },
      // Re-crawls the site's real sitemap.xml (recursing sitemap indexes) and
      // replaces the stored inventory. Manual-trigger only, same as the
      // orchestrator and autocrawl -- no scheduler in this app.
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sites, sitePages } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [site] = await d.select().from(sites).where(eq(sites.id, params.id)).limit(1);
          if (!site) {
            return Response.json({ ok: false, error: "Site not found" }, { status: 404 });
          }

          const result = await crawlSitemap(site.domain);
          if (result.error) {
            return Response.json({ ok: false, error: result.error }, { status: 502 });
          }

          const now = new Date();
          await d.delete(sitePages).where(eq(sitePages.siteId, params.id));
          if (result.urls.length > 0) {
            await d.insert(sitePages).values(
              result.urls.map((u) => ({
                siteId: params.id,
                url: u.loc,
                lastmod: u.lastmod,
                changefreq: u.changefreq,
                priority: u.priority,
                lastCrawledAt: now,
              })),
            );
          }

          // Keep sites.pagesTotal in sync with the real count so dashboard/
          // agency-health KPIs that read it stop showing stale numbers.
          await d.update(sites).set({ pagesTotal: result.urls.length, updatedAt: now }).where(eq(sites.id, params.id));

          await logAudit(actorEmailFromRequest(request), "site.pages_crawled", {
            siteId: params.id,
            urlCount: result.urls.length,
            sitemapsFound: result.sitemapsFound.length,
            truncated: result.truncated,
          });

          return Response.json({
            ok: true,
            count: result.urls.length,
            sitemapsFound: result.sitemapsFound,
            truncated: result.truncated,
            lastCrawledAt: now,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to crawl sitemap" }, { status: 500 });
        }
      },
    },
  },
});
