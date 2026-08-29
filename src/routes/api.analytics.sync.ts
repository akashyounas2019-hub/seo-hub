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
    const { eq, or } = await import("drizzle-orm");
    await ensureSchema();
    const d = db();
    const todayStr = nowIso.split("T")[0];

    // trafficSnapshots.siteId is a real uuid FK to sites.id -- targetSiteId
    // above may be a slug ("safaeewala") or missing entirely, neither of
    // which is a valid uuid. Resolve to the real site row first; previously
    // this INSERT always violated the FK type/constraint for anything but
    // an already-correct uuid, and the failure was silently swallowed by
    // this same catch block, so no snapshot was ever actually persisted
    // for the common case of an external pipeline posting a bare slug.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetSiteId);
    const [resolvedSite] = await d
      .select({ id: sites.id })
      .from(sites)
      .where(isUuid ? eq(sites.id, targetSiteId) : or(eq(sites.slug, targetSiteId), eq(sites.domain, targetSiteId)))
      .limit(1);

    if (resolvedSite) {
      await d
        .insert(trafficSnapshots)
        .values({
          siteId: resolvedSite.id,
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

      await d.update(sites).set({ updatedAt: new Date() }).where(eq(sites.id, resolvedSite.id));
    }
  } catch {
    /* optional DB fallback -- the in-memory syncStore write above already succeeded regardless */
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
          let currentSynced = syncStore[siteId];

          // The in-memory cache above is wiped on every server
          // restart/redeploy -- previously that meant a real, successfully
          // persisted trafficSnapshots row became permanently unreachable
          // the moment the process restarted, since this handler never
          // looked at the real table. Fall back to the most recent real
          // row for this site so a restart doesn't silently erase synced
          // data that's genuinely still in Postgres.
          if (!currentSynced) {
            try {
              const { db, ensureSchema } = await import("@/db/client");
              const { trafficSnapshots, sites } = await import("@/db/schema");
              const { eq, or, desc } = await import("drizzle-orm");
              await ensureSchema();
              const d = db();

              // siteId query param may be a slug/domain, not the real uuid
              // trafficSnapshots.siteId requires -- resolve it the same way
              // handlePost() does before querying.
              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId);
              const [resolvedSite] = await d
                .select({ id: sites.id })
                .from(sites)
                .where(isUuid ? eq(sites.id, siteId) : or(eq(sites.slug, siteId), eq(sites.domain, siteId)))
                .limit(1);

              const [latest] = resolvedSite
                ? await d
                    .select()
                    .from(trafficSnapshots)
                    .where(eq(trafficSnapshots.siteId, resolvedSite.id))
                    .orderBy(desc(trafficSnapshots.snapshotDate))
                    .limit(1)
                : [];
              if (latest) {
                currentSynced = (latest.detail as typeof currentSynced) || {
                  siteId,
                  lastSyncedAt: `${latest.snapshotDate}T00:00:00.000Z`,
                  source: latest.source,
                };
              }
            } catch {
              /* fall through to "not synced" below */
            }
          }

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
