import { createFileRoute } from "@tanstack/react-router";
import { parseObsidianNote } from "@/lib/obsidian";

export const Route = createFileRoute("/api/knowledge/autocrawl")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({ ok: true, message: "Use POST /api/knowledge/autocrawl with { url: 'https://...' }" });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const targetUrl = body?.url;
          if (!targetUrl) {
            return Response.json({ ok: false, error: "url is required" }, { status: 400 });
          }

          // Fetch live target URL content
          let rawHtml = "";
          let fetchOk = false;
          try {
            const res = await fetch(targetUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SEOHubAutoCrawler/1.0",
              },
              signal: AbortSignal.timeout(6000),
            });
            if (res.ok) {
              rawHtml = await res.text();
              fetchOk = true;
            }
          } catch {
            /* target unreachable */
          }

          if (!fetchOk) {
            return Response.json(
              { ok: false, error: `Could not fetch ${targetUrl}. The autocrawler currently only extracts title/description from a live page — no content is fabricated when the fetch fails.` },
              { status: 502 },
            );
          }

          const titleMatch = rawHtml.match(/<title>(.*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1] : "";

          const descMatch = rawHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i);
          const description = descMatch ? descMatch[1] : "";

          const obsidianSop = parseObsidianNote(
            `---
title: ${title || targetUrl} - Operational SOP
category: Auto Generated SOP
---

# ${title || targetUrl} - Autonomous Execution SOP

Target URL: [[${targetUrl}]]`,
            `${title || targetUrl} SOP`,
          );

          return Response.json({
            ok: true,
            url: targetUrl,
            extracted: {
              title,
              description,
              obsidianSop,
              crawledAt: new Date().toISOString(),
              note: "Only title/meta-description are extracted from the live page. Services, FAQs, phone, and address are not auto-detected yet — add them manually in the Knowledge Studio.",
            },
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
