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
              // Real Search Analytics data, not the Sitemaps report:
              // GSC's sitemaps.get contents[].indexed field is Google's own
              // sitemap-specific indexation counter, which is frequently
              // stale or reports 0 even for sites with genuinely indexed
              // pages -- confirmed live against this site (submitted: 80,
              // indexed: 0 from that endpoint, while 68 of those same URLs
              // had real impressions in the last 28 days). A URL that
              // received a real impression is unambiguously indexed and
              // being served by Google -- a far more current, reliable
              // signal than the sitemap report's own lagging counter.
              const { fetchGSCSearchAnalytics } = await import("@/lib/google/search-console");
              const end = new Date();
              end.setDate(end.getDate() - 2);
              const start = new Date();
              start.setDate(start.getDate() - 30);
              const fmt = (dt: Date) => dt.toISOString().split("T")[0];

              const pageRows = await fetchGSCSearchAnalytics(site.gscPropertyUrl, {
                startDate: fmt(start),
                endDate: fmt(end),
                dimensions: ["page"],
                rowLimit: 5000,
              });

              // Only count pages that are BOTH in the real sitemap AND have
              // real impressions -- matches "Indexed" against the same
              // sitemap-page population "Total Pages" counts, rather than
              // counting any URL GSC has ever seen (which could include
              // pages no longer in the sitemap, or ones GSC found via other
              // means).
              const sitemapUrlSet = new Set(pages.map((p) => p.url.replace(/\/$/, "")));
              indexedCount = pageRows.filter((r: any) => {
                const url = (r.keys?.[0] || "").replace(/\/$/, "");
                return sitemapUrlSet.has(url) && (r.impressions || 0) > 0;
              }).length;
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
