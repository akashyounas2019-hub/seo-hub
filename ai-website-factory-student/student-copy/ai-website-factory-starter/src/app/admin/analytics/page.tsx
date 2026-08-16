/**
 * Analytics main dashboard — simplified.
 *
 * Three property connector rows (GA / GSC / GBP) show only the property
 * name + a single "Connected" or "Not connected" pill button. Clicking
 * Connect opens a per-site picker (Google OAuth is per-site in this
 * codebase — see /api/integrations/google/start). GBP has no route yet,
 * so its Connect button opens an explainer instead of a 404.
 *
 * Below the connectors we render user-added widgets from analytics_widgets,
 * each with server-computed data.
 */
import { and, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { analyticsWidgets, integrationsAccounts, sites, trafficSnapshots } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import {
  computeWidgetData,
  findWidgetCatalogEntry,
  type WidgetData,
} from "@/lib/analytics-widget-catalog";
import { AnalyticsHub, type ConnectorCard, type WidgetInstance } from "./AnalyticsHub";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  // Per-property connection state.
  const googleAccounts = await d
    .select({ siteId: integrationsAccounts.siteId })
    .from(integrationsAccounts)
    .where(eq(integrationsAccounts.provider, "google"));
  const gaConnected  = googleAccounts.length > 0;
  const gscConnected = googleAccounts.length > 0;

  const [gbpSample] = await d
    .select({ id: trafficSnapshots.id })
    .from(trafficSnapshots)
    .where(and(eq(trafficSnapshots.source, "gbp")))
    .limit(1);
  const gbpConnected = !!gbpSample;

  // Sites list for the OAuth picker.
  const siteRows = await d
    .select({ slug: sites.slug, name: sites.name, id: sites.id })
    .from(sites)
    .orderBy(sites.name);
  const connectedSiteIds = new Set(googleAccounts.map((a) => a.siteId));
  const siteOptions = siteRows.map((s) => ({
    slug: s.slug,
    name: s.name,
    connected: connectedSiteIds.has(s.id),
  }));

  const cards: ConnectorCard[] = [
    {
      id: "ga",
      title: "Google Analytics",
      href: "/admin/analytics/google-analytics",
      accent: "orange",
      provider: "google",
      connected: gaConnected,
    },
    {
      id: "gsc",
      title: "Search Console",
      href: "/admin/analytics/search-console",
      accent: "cyan",
      provider: "google",
      connected: gscConnected,
    },
    {
      id: "gbp",
      title: "Google Business Profile",
      href: "/admin/analytics/business-profile",
      accent: "fuchsia",
      provider: "gbp",
      connected: gbpConnected,
    },
  ];

  // Load persisted widgets + compute their data server-side.
  const widgetRows = await d
    .select()
    .from(analyticsWidgets)
    .orderBy(analyticsWidgets.position);

  const widgets: WidgetInstance[] = await Promise.all(
    widgetRows.map(async (row): Promise<WidgetInstance> => {
      const entry = findWidgetCatalogEntry(row.kind);
      let data: WidgetData;
      if (!entry) {
        data = { type: "empty", message: `Unknown widget kind: ${row.kind}` };
      } else if (!row.enabled) {
        data = { type: "empty", message: "Widget is disabled." };
      } else {
        try {
          data = await computeWidgetData(entry.kind, row.settings ?? {});
        } catch (err) {
          data = { type: "empty", message: `Compute error: ${err instanceof Error ? err.message : String(err)}` };
        }
      }
      return {
        id: row.id,
        kind: row.kind,
        label: row.label,
        enabled: row.enabled,
        icon: entry?.icon ?? "Zap",
        accent: entry?.accent ?? "cyan",
        data,
      };
    }),
  );

  return (
    <AnalyticsHub
      cards={cards}
      siteOptions={siteOptions}
      widgets={widgets}
    />
  );
}
