import { createFileRoute } from "@tanstack/react-router";
import { scrapeSite } from "@/lib/web-scraper";

export const Route = createFileRoute("/api/knowledge/autocrawl")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          message: "POST { url, siteId } — crawls the site, then enqueues a knowledge:structure-from-crawl job for the AKS worker to structure into the Knowledge Base.",
        });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const targetUrl = body?.url;
          const siteId = body?.siteId || null;
          if (!targetUrl) {
            return Response.json({ ok: false, error: "url is required" }, { status: 400 });
          }

          const scraped = await scrapeSite(targetUrl);
          if (!scraped) {
            return Response.json(
              { ok: false, error: `Could not fetch ${targetUrl}. No content was crawled — nothing is fabricated on failure.` },
              { status: 502 },
            );
          }

          const { db, ensureSchema } = await import("@/db/client");
          const { claudeJobs } = await import("@/db/schema");
          await ensureSchema();
          const d = db();

          const [job] = await d
            .insert(claudeJobs)
            .values({
              kind: "knowledge:structure-from-crawl",
              title: `Structure Knowledge Base from crawl of ${targetUrl}`,
              siteId: siteId || undefined,
              input: {
                siteId,
                url: targetUrl,
                pages: scraped.pages,
              },
              status: "pending",
              priority: "high",
              preferWorker: "any",
              triggerSource: "knowledge_autocrawl",
            })
            .returning();

          return Response.json({
            ok: true,
            jobId: job.id,
            url: targetUrl,
            pagesCrawled: scraped.pages.length,
            linksFound: scraped.linksFound,
            message: `Crawled ${scraped.pages.length} page(s). Job ${job.id} enqueued — waiting for the AKS worker to structure it into the Knowledge Base.`,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
