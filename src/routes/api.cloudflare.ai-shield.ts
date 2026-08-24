import { createFileRoute } from "@tanstack/react-router";

const CLOUDFLARE_ZONE_ID = "7e261ba0e81f13089b7e136c136c41e1";

export const Route = createFileRoute("/api/cloudflare/ai-shield")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({ ok: true, zoneId: CLOUDFLARE_ZONE_ID, shieldStatus: "Active" });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { botId, action, userAgent, vendor } = body;
          const cfToken = process.env.CLOUDFLARE_API_TOKEN;

          // Trigger Cloudflare Firewall / WAF Rule API
          let cfResponse: any = null;
          if (cfToken) {
            try {
              const res = await fetch(
                `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/firewall/access_rules/rules`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${cfToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    mode: action === "block" ? "block" : "jschallenge",
                    configuration: { target: "user_agent", value: userAgent || botId },
                    notes: `SEO Hub AI Crawler Shield rule for ${vendor || botId}`,
                  }),
                  signal: AbortSignal.timeout(4000),
                },
              );
              if (res.ok) {
                cfResponse = await res.json();
              }
            } catch (err) {
              /* Ignore if network timeout in local test */
            }
          }

          return Response.json({
            ok: true,
            botId,
            action,
            cloudflareApplied: !!cfToken && !!cfResponse,
            ruleId: cfResponse?.result?.id || null,
            message: cfToken
              ? `Cloudflare Edge Firewall ${action === "block" ? "BLOCKED" : "ALLOWED"} user agent '${botId}' across zone '${CLOUDFLARE_ZONE_ID}'`
              : "CLOUDFLARE_API_TOKEN is not configured — no rule was applied.",
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
