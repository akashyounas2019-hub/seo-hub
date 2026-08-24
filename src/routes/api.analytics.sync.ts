import { createFileRoute } from "@tanstack/react-router";

// In-memory store for synced metrics across dashboard tabs. This is a cache
// of whatever an external pipeline (e.g. n8n) has pushed via POST — it is
// NOT a source of live data itself, and carries no fabricated defaults.
const syncStore: Record<string, {
  siteId: string;
  lastSyncedAt: string;
  source: string;
  overview?: Record<string, unknown>;
  ga?: Record<string, unknown>;
  gsc?: Record<string, unknown>;
  gbp?: Record<string, unknown>;
  aiCrawl?: Record<string, unknown>;
}> = {};

async function handlePost(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* fallback empty body */
  }

  const targetSiteId = body.siteId || "safaeewala";
  const nowIso = new Date().toISOString();

  const syncedRecord = {
    siteId: targetSiteId,
    lastSyncedAt: nowIso,
    source: body.source || "external_pipeline",
    overview: body.overview,
    ga: body.ga,
    gsc: body.gsc,
    gbp: body.gbp,
    aiCrawl: body.aiCrawl,
  };

  syncStore[targetSiteId] = syncedRecord;

  try {
    const { db, ensureSchema } = await import("@/db/client");
    const { trafficSnapshots, sites } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await ensureSchema();
    const d = db();
    const todayStr = nowIso.split("T")[0];

    await d
      .insert(trafficSnapshots)
      .values({
        siteId: targetSiteId,
        source: syncedRecord.source,
        snapshotDate: todayStr,
        metrics: {
          activeUsers: Number((body.ga as any)?.activeUsers) || 0,
          sessions: Number((body.ga as any)?.sessions) || 0,
          impressions: Number((body.gsc as any)?.impressions) || 0,
          clicks: Number((body.gsc as any)?.clicks) || 0,
          gbpCalls: Number((body.gbp as any)?.calls) || 0,
          botRequests: Number((body.aiCrawl as any)?.totalBotRequests) || 0,
        },
        detail: syncedRecord,
      })
      .onConflictDoNothing();

    await d.update(sites).set({ updatedAt: new Date() }).where(eq(sites.id, targetSiteId));
  } catch {
    /* optional DB fallback */
  }

  return Response.json({
    success: true,
    message: `Synced metrics recorded for site '${targetSiteId}'`,
    siteId: targetSiteId,
    lastSyncedAt: nowIso,
    data: syncedRecord,
  });
}

export const Route = createFileRoute("/api/analytics/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const siteId = url.searchParams.get("siteId") || "safaeewala";
          const currentSynced = syncStore[siteId];
          return Response.json({
            ok: true,
            status: "Analytics Sync System Active",
            siteId,
            synced: !!currentSynced,
            lastSyncedAt: currentSynced?.lastSyncedAt || null,
            data: currentSynced || null,
          });
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to read sync status" }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          return await handlePost(request);
        } catch (err: any) {
          return Response.json({ error: err.message || "Failed to sync analytics" }, { status: 500 });
        }
      },
    },
  },
});
