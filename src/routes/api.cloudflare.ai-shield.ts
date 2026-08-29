import { createFileRoute } from "@tanstack/react-router";
import { fetchFirewallRules } from "@/lib/cloudflare";

export const Route = createFileRoute("/api/cloudflare/ai-shield")({
  server: {
    handlers: {
      GET: async () => {
        const zoneId = process.env.CLOUDFLARE_ZONE_ID || null;
        const configured = !!process.env.CLOUDFLARE_API_TOKEN && !!zoneId;
        if (!configured) {
          return Response.json({
            ok: false,
            configured: false,
            error: "Cloudflare is not configured — set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in the environment.",
          });
        }
        try {
          const rules = await fetchFirewallRules();
          return Response.json({ ok: true, configured: true, zoneId, rules });
        } catch (err: any) {
          return Response.json({ ok: false, configured: true, zoneId, error: err.message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const zoneId = process.env.CLOUDFLARE_ZONE_ID;
          const cfToken = process.env.CLOUDFLARE_API_TOKEN;
          if (!cfToken || !zoneId) {
            return Response.json({
              ok: false,
              error: "Cloudflare is not configured — set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in the environment.",
            }, { status: 400 });
          }

          const body = await request.json();
          const { botId, action, userAgent, vendor } = body;

          const res = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/firewall/access_rules/rules`,
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
              signal: AbortSignal.timeout(6000),
            },
          );
          const cfResponse = await res.json();
          if (!res.ok || !cfResponse.success) {
            return Response.json({ ok: false, error: cfResponse?.errors?.[0]?.message || "Cloudflare rule creation failed" }, { status: 502 });
          }

          return Response.json({
            ok: true,
            botId,
            action,
            ruleId: cfResponse.result?.id || null,
            message: `Cloudflare Edge Firewall ${action === "block" ? "BLOCKED" : "ALLOWED"} user agent '${botId}' across zone '${zoneId}'`,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
