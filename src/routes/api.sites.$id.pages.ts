import { createFileRoute } from "@tanstack/react-router";
import { crawlSitemap } from "@/lib/sitemap-crawler";
import { fetchGSCSitemaps } from "@/lib/google/search-console";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";

export const Route = createFileRoute("/api/sites/$id/pages")({
  server: {
    handlers: {
      // Returns the last-crawled inventory from Postgres -- no network call,
      // safe to load on every Site Pages tab visit.
      GET: async ({ params }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { sitePages, sites } = await import("@/db/schema");
          const { eq, asc } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();
          const pages = await d
            .select()
            .from(sitePages)
            .where(eq(sitePages.siteId, params.id))
            .orderBy(asc(sitePages.url));

          // Real indexed count from Search Console, when connected --
          // Google's own figure for pages actually indexed from this site's
          // submitted sitemaps, not derived from the sitemap crawl itself
          // (a sitemap listing a URL says nothing about whether Google has
          // actually indexed it).
          let indexedCount: number | null = null;
          let indexedError: string | null = null;
          const [site] = await d.select().from(sites).where(eq(sites.id, params.id)).limit(1);
          if (site?.gscConnected && site.gscPropertyUrl) {
            try {
              const sitemaps = await fetchGSCSitemaps(site.gscPropertyUrl);
              indexedCount = sitemaps.reduce((sum, sm) => {
                const webContent = sm.contents?.find((c) => c.type === "web") || sm.contents?.[0];
                // The sitemaps.get endpoint (unlike searchAnalytics.query)
                // returns submitted/indexed as strings, not JSON numbers.
                return sum + (Number(webContent?.indexed) || 0);
              }, 0);
            } catch (err: any) {
              indexedError = err.message;
            }
          }

          return Response.json({
            ok: true,
            pages,
            count: pages.length,
            lastCrawledAt: pages[0]?.lastCrawledAt || null,
            indexedCount,
            indexedError,
            gscConnected: !!site?.gscConnected,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to load site pages" }, { status: 500 });
        }
      },
      // Re-crawls the site's sitemap (recursing sitemap indexes) and
      // replaces the stored inventory. Manual-trigger only, same as the
      // orchestrator and autocrawl -- no scheduler in this app. Accepts an
      // optional real sitemapUrl in the body (a user-entered URL, e.g. when
      // it isn't at the default /sitemap.xml location); falls back to the
      // site's own domain-derived default otherwise.
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

          let sitemapUrl: string | undefined;
          try {
            const body = await request.json();
            sitemapUrl = body?.sitemapUrl?.trim() || undefined;
          } catch {
            /* no body / not JSON -- fine, use the default */
          }

          const result = await crawlSitemap(site.domain, sitemapUrl);
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
            sitemapUrl: sitemapUrl || null,
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
