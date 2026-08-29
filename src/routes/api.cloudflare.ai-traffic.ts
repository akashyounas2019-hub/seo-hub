import { createFileRoute } from "@tanstack/react-router";
import { fetchAiBotTraffic } from "@/lib/cloudflare";

// Real Cloudflare bot traffic -- replaces the entirely fabricated
// INITIAL_BOTS/TOP_AI_PAGES arrays that used to live in
// analytics-ai-overview.tsx (invented request counts, invented "data
// scraped" sizes for every AI crawler, regardless of whether Cloudflare
// was even connected).
export const Route = createFileRoute("/api/cloudflare/ai-traffic")({
  server: {
    handlers: {
      GET: async () => {
        const configured = !!process.env.CLOUDFLARE_API_TOKEN && !!process.env.CLOUDFLARE_ZONE_ID;
        if (!configured) {
          return Response.json({
            ok: false,
            configured: false,
            error: "Cloudflare is not configured — set CLOUDFLARE_API_TOKEN (Zone Analytics: Read) and CLOUDFLARE_ZONE_ID in the environment to see real bot traffic here.",
          });
        }
        try {
          const { bots, topUrls } = await fetchAiBotTraffic(24);
          return Response.json({ ok: true, configured: true, bots, topUrls });
        } catch (err: any) {
          return Response.json({ ok: false, configured: true, error: err.message || "Failed to load Cloudflare bot traffic" }, { status: 500 });
        }
      },
    },
  },
});
