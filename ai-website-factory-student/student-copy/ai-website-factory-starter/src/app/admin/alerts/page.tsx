/**
 * Alert Manager — real-time SEO alerts across local rankings, citations,
 * GBP, reviews and site health. Reads from the `alerts` table, classifies
 * each into one of seven categories, and pipes to <AlertManagerHub /> for
 * the dark cyan-grid render.
 */
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/server-auth";
import { db, ensureSchema } from "@/db/client";
import { alerts, alertRules, sites, users } from "@/db/schema";
import { RULE_KINDS } from "@/lib/alerts/rule-config";
import {
  AlertManagerHub,
  type AlertCard,
  type AlertCategoryId,
} from "./AlertManagerHub";

export const dynamic = "force-dynamic";

/** Map a check `kind` slug to one of the seven visual categories. */
function classifyAlertKind(kind: string): AlertCategoryId {
  const k = kind.toLowerCase();
  if (/rank|position|serp|local.?pack/.test(k)) return "local-rank";
  if (/nap|citation|listing|directory/.test(k)) return "citations";
  if (/gbp|business.?profile|gmb/.test(k)) return "gbp";
  if (/cwv|lcp|inp|cls|perf|uptime|latency|speed/.test(k)) return "site-perf";
  if (/review|rating/.test(k)) return "reviews";
  if (/backlink|link|referring|toxic|disavow/.test(k)) return "backlinks";
  if (/ssl|security|tech|redirect|robots|indexation|drift/.test(k)) return "technical";
  return "technical";
}

/** Best-effort "source" label (e.g. "Local Rank Tracker") from kind. */
function sourceForKind(kind: string, category: AlertCategoryId): string {
  const k = kind.toLowerCase();
  if (k.includes("rank")) return "Local Rank Tracker";
  if (k.includes("citation") || k.includes("nap")) return "Citation Monitor";
  if (k.includes("review")) return "GBP Reviews";
  if (k.includes("gbp") || k.includes("business")) return "GBP Sync";
  if (k.includes("cwv") || k.includes("perf")) return "Core Web Vitals";
  if (k.includes("uptime")) return "Uptime Watcher";
  if (k.includes("backlink") || k.includes("link")) return "Backlink Monitor";
  if (k.includes("ssl") || k.includes("tech")) return "Uptime Watcher";
  return CATEGORY_LABEL[category];
}

const CATEGORY_LABEL: Record<AlertCategoryId, string> = {
  "local-rank": "Local Rank",
  "citations":  "Citations / NAP",
  "gbp":        "Google Business Profile",
  "site-perf":  "Site Performance",
  "reviews":    "Reviews",
  "backlinks":  "Backlinks",
  "technical":  "Technical / Security",
};

/** Relative time formatter: "12 min ago", "1h ago", "3d ago". */
function relTime(from: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function AlertsPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const [rows, ruleRows, siteRows, userRows] = await Promise.all([
    d.select().from(alerts).orderBy(desc(alerts.lastSeenAt)).limit(80),
    d.select().from(alertRules).orderBy(alertRules.kind),
    d.select({ id: sites.id, name: sites.name }).from(sites).orderBy(sites.name),
    d.select({ id: users.id, email: users.email, name: users.name }).from(users).orderBy(users.email),
  ]);

  const siteById = new Map(siteRows.map((s) => [s.id, s.name] as const));

  const cards: AlertCard[] = rows.map((a) => {
    const category = classifyAlertKind(a.kind);
    const payload = a.payload as Record<string, unknown>;
    const zone = typeof payload.zone === "string" ? payload.zone : null;
    const posBefore = typeof payload.position_before === "number" ? payload.position_before : null;
    const posAfter  = typeof payload.position_after === "number" ? payload.position_after : null;
    const meta = typeof payload.meta === "string" ? payload.meta : null;
    const domain = typeof payload.domain === "string" ? payload.domain : null;
    const chip = meta ??
      (posBefore != null && posAfter != null ? `#${posBefore} → #${posAfter}` : null) ??
      (typeof payload.value === "string" ? payload.value : null);
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      severity: a.severity,
      status: a.status,
      enabled: a.enabled,
      category,
      categoryLabel: CATEGORY_LABEL[category],
      source: sourceForKind(a.kind, category),
      siteName: a.siteId ? siteById.get(a.siteId) ?? null : null,
      zone,
      chip,
      domain,
      ageLabel: relTime(a.lastSeenAt),
    };
  });

  // Weekly count: everything created in the last 7 days.
  const weekAgoMs = Date.now() - 7 * 24 * 3600_000;
  const weeklyTotal = rows.filter((r) => r.firstSeenAt.getTime() >= weekAgoMs).length;

  const active       = cards.filter((c) => c.status === "open").length;
  const critical     = cards.filter((c) => c.severity === "critical" && c.status !== "resolved" && c.status !== "dismissed").length;
  const acknowledged = cards.filter((c) => c.status === "acknowledged").length;
  const oneDayAgoMs  = Date.now() - 24 * 3600_000;
  const resolvedLast24h = rows.filter((r) => r.resolvedAt && r.resolvedAt.getTime() >= oneDayAgoMs).length;

  return (
    <AlertManagerHub
      cards={cards}
      counters={{
        critical,
        active,
        acknowledged,
        resolvedLast24h,
        weeklyTotal,
      }}
      rules={{
        ruleKindDefs: RULE_KINDS,
        siteOptions: siteRows,
        userOptions: userRows,
        currentRules: ruleRows.map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind,
          enabled: r.enabled,
        })),
      }}
    />
  );
}
