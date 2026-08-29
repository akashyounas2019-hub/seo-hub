// Real Cloudflare integration. Previously src/lib/google/ai-crawl.ts
// pretended to call a real API but used `|| <fabricated number>` fallbacks
// on every field AND a hardcoded crawlers/topTargetedUrls array that never
// reflected the actual response even when the call succeeded -- fake data
// dressed up as live data. That file also called the wrong endpoint
// (/bot_management returns bot-management *configuration*, not per-bot
// traffic counts) and was completely unused anywhere in the app.
//
// This uses Cloudflare's real GraphQL Analytics API
// (httpRequestsAdaptiveGroups), which is the actual dataset for
// "requests by user agent over a time range" on a zone. Requires a real
// CLOUDFLARE_API_TOKEN with Zone Analytics (read) permission -- if it's
// not set, every function here throws rather than returning invented
// numbers, and callers must show an honest "not connected" state.

const AI_BOT_USER_AGENT_PATTERNS = [
  { id: "gptbot", label: "GPTBot", vendor: "OpenAI", match: "GPTBot" },
  { id: "chatgpt-user", label: "ChatGPT-User", vendor: "OpenAI", match: "ChatGPT-User" },
  { id: "oai-searchbot", label: "OAI-SearchBot", vendor: "OpenAI", match: "OAI-SearchBot" },
  { id: "claudebot", label: "ClaudeBot", vendor: "Anthropic", match: "ClaudeBot" },
  { id: "claude-user", label: "Claude-User", vendor: "Anthropic", match: "Claude-User" },
  { id: "google-extended", label: "Google-Extended", vendor: "Google AI", match: "Google-Extended" },
  { id: "googleother", label: "GoogleOther", vendor: "Google", match: "GoogleOther" },
  { id: "bytespider", label: "Bytespider", vendor: "ByteDance", match: "Bytespider" },
  { id: "perplexitybot", label: "PerplexityBot", vendor: "Perplexity AI", match: "PerplexityBot" },
  { id: "meta-externalagent", label: "Meta-ExternalAgent", vendor: "Meta", match: "Meta-ExternalAgent" },
  { id: "applebot-extended", label: "Applebot-Extended", vendor: "Apple", match: "Applebot-Extended" },
  { id: "amazonbot", label: "Amazonbot", vendor: "Amazon", match: "Amazonbot" },
  { id: "ccbot", label: "CCBot", vendor: "Common Crawl", match: "CCBot" },
];

export type CloudflareBotTraffic = {
  id: string;
  label: string;
  vendor: string;
  userAgentMatch: string;
  requests: number;
  bytesScraped: number;
};

export type CloudflareTopUrl = { path: string; requests: number };

function getCredentials() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) {
    throw new Error(
      "Cloudflare is not configured — set CLOUDFLARE_API_TOKEN (Zone Analytics: Read permission) and CLOUDFLARE_ZONE_ID in the environment.",
    );
  }
  return { token, zoneId };
}

async function graphql(query: string, variables: Record<string, unknown>) {
  const { token } = getCredentials();
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.[0]?.message || `Cloudflare GraphQL request failed (${res.status})`);
  }
  return json.data;
}

/**
 * Real per-bot request counts over the last N hours, from Cloudflare's
 * actual HTTP requests analytics dataset, filtered client-side (the
 * GraphQL API doesn't support OR-of-contains on userAgent server-side for
 * this dataset) against the known AI-bot user-agent substring list above.
 */
export async function fetchAiBotTraffic(hoursAgo = 24): Promise<{ bots: CloudflareBotTraffic[]; topUrls: CloudflareTopUrl[] }> {
  const { zoneId } = getCredentials();
  const since = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const until = new Date().toISOString();

  const query = `
    query BotTraffic($zoneId: String!, $since: Time!, $until: Time!) {
      viewer {
        zones(filter: { zoneTag: $zoneId }) {
          httpRequestsAdaptiveGroups(
            limit: 5000
            filter: { datetime_geq: $since, datetime_leq: $until }
          ) {
            count
            sum { edgeResponseBytes }
            dimensions { userAgent clientRequestPath }
          }
        }
      }
    }
  `;

  const data = await graphql(query, { zoneId, since, until });
  const groups: Array<{ count: number; sum?: { edgeResponseBytes?: number }; dimensions: { userAgent: string; clientRequestPath: string } }> =
    data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

  const botTotals = new Map<string, { requests: number; bytes: number }>();
  const urlTotals = new Map<string, number>();

  for (const g of groups) {
    const ua = g.dimensions?.userAgent || "";
    const matched = AI_BOT_USER_AGENT_PATTERNS.find((p) => ua.includes(p.match));
    if (!matched) continue;
    const current = botTotals.get(matched.id) || { requests: 0, bytes: 0 };
    current.requests += g.count;
    current.bytes += g.sum?.edgeResponseBytes || 0;
    botTotals.set(matched.id, current);

    const path = g.dimensions?.clientRequestPath || "/";
    urlTotals.set(path, (urlTotals.get(path) || 0) + g.count);
  }

  const bots: CloudflareBotTraffic[] = AI_BOT_USER_AGENT_PATTERNS.map((p) => {
    const totals = botTotals.get(p.id) || { requests: 0, bytes: 0 };
    return { id: p.id, label: p.label, vendor: p.vendor, userAgentMatch: p.match, requests: totals.requests, bytesScraped: totals.bytes };
  }).filter((b) => b.requests > 0);

  const topUrls: CloudflareTopUrl[] = Array.from(urlTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, requests]) => ({ path, requests }));

  return { bots, topUrls };
}

/** Real active WAF/firewall rules for this zone, to show real block/allow state instead of client-only toggle state. */
export async function fetchFirewallRules(): Promise<Array<{ id: string; userAgent: string; mode: string; notes: string }>> {
  const { token, zoneId } = getCredentials();
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/firewall/access_rules/rules?per_page=100`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(6000),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.errors?.[0]?.message || `Failed to load firewall rules (${res.status})`);
  }
  return (json.result || [])
    .filter((r: any) => r.configuration?.target === "user_agent")
    .map((r: any) => ({ id: r.id, userAgent: r.configuration.value, mode: r.mode, notes: r.notes || "" }));
}
