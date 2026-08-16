/**
 * Analytics widget shared types + the client-safe catalog.
 *
 * This file intentionally has ZERO server imports (no drizzle, no db, no
 * node built-ins) so it can be imported from client components without
 * dragging `pg` / `fs` into the browser bundle. The server-side
 * `computeWidgetData()` lives next door in `analytics-widget-catalog.ts`.
 */

export type WidgetKind =
  | "ga_sessions_28d"
  | "ga_conversions_28d"
  | "gsc_top_queries"
  | "gsc_top_pages"
  | "gsc_position_trend"
  | "gbp_calls_28d";

export interface WidgetCatalogEntry {
  kind: WidgetKind;
  name: string;
  description: string;
  /** Icon name from lucide-react — resolved by the client component. */
  icon: string;
  /** Accent used by the client tile. */
  accent: "orange" | "cyan" | "fuchsia" | "emerald";
  emptyLabel: string;
  defaultSettings: Record<string, unknown>;
}

export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  {
    kind: "ga_sessions_28d",
    name: "GA — Sessions (28 days)",
    description: "Total GA4 sessions across every connected site in the last 28 days, with delta vs. the prior 28.",
    icon: "Users",
    accent: "orange",
    emptyLabel: "No GA4 samples yet — run npm run sync:ga4.",
    defaultSettings: { window: 28 },
  },
  {
    kind: "ga_conversions_28d",
    name: "GA — Conversions (28 days)",
    description: "Sum of GA4 conversions across the network, with delta vs. the prior 28-day window.",
    icon: "TrendingUp",
    accent: "emerald",
    emptyLabel: "No conversions data yet.",
    defaultSettings: { window: 28 },
  },
  {
    kind: "gsc_top_queries",
    name: "GSC — Top queries",
    description: "Highest-click queries from the last 28 days, aggregated across every verified property.",
    icon: "Search",
    accent: "cyan",
    emptyLabel: "No GSC queries yet — run npm run sync:gsc.",
    defaultSettings: { limit: 5 },
  },
  {
    kind: "gsc_top_pages",
    name: "GSC — Top pages",
    description: "Best-performing landing pages by clicks across the network in the last 28 days.",
    icon: "FileText",
    accent: "cyan",
    emptyLabel: "No GSC page-level data yet.",
    defaultSettings: { limit: 5 },
  },
  {
    kind: "gsc_position_trend",
    name: "GSC — Average position trend",
    description: "Rolling 12-week average position across every query, network-wide.",
    icon: "Hash",
    accent: "fuchsia",
    emptyLabel: "No GSC position data yet.",
    defaultSettings: {},
  },
  {
    kind: "gbp_calls_28d",
    name: "GBP — Calls (28 days)",
    description: "Google Business Profile phone calls across every listed location.",
    icon: "Phone",
    accent: "fuchsia",
    emptyLabel: "No GBP samples yet — GBP sync isn't implemented.",
    defaultSettings: { window: 28 },
  },
];

export function findWidgetCatalogEntry(kind: string): WidgetCatalogEntry | undefined {
  return WIDGET_CATALOG.find((w) => w.kind === kind);
}

/* ─────────── data payload shapes ─────────── */

export interface KpiWidgetData {
  type: "kpi";
  value: string;
  delta: number;
  sub: string;
}

export interface ListWidgetData {
  type: "list";
  rows: { primary: string; secondary: string }[];
}

export interface SparklineWidgetData {
  type: "sparkline";
  points: number[];
  latest: string;
  label: string;
}

export interface EmptyWidgetData {
  type: "empty";
  message: string;
}

export type WidgetData = KpiWidgetData | ListWidgetData | SparklineWidgetData | EmptyWidgetData;
