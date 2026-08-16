"use server";

import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { alerts } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";

export async function ackAlert(id: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  const me = await requireAdmin();
  await db()
    .update(alerts)
    .set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: me.id })
    .where(eq(alerts.id, id));
  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function snoozeAlert(id: string, hours: number): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  const until = new Date(Date.now() + Math.max(1, Math.min(72, hours)) * 3600_000);
  await db()
    .update(alerts)
    .set({ status: "snoozed", snoozedUntil: until })
    .where(eq(alerts.id, id));
  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function resolveAlert(id: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db()
    .update(alerts)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(alerts.id, id));
  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function dismissAlert(id: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db()
    .update(alerts)
    .set({ status: "dismissed", dismissedAt: new Date() })
    .where(eq(alerts.id, id));
  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleAlertEnabled(id: string, enabled: boolean): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db().update(alerts).set({ enabled }).where(eq(alerts.id, id));
  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function editAlert(
  id: string,
  patch: { title?: string; body?: string | null },
): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  const update: Record<string, unknown> = {};
  if (typeof patch.title === "string" && patch.title.trim()) update.title = patch.title.trim();
  if (patch.body !== undefined) update.body = patch.body ? patch.body : null;
  if (Object.keys(update).length === 0) return { ok: true };
  await db().update(alerts).set(update).where(eq(alerts.id, id));
  revalidatePath("/admin/alerts");
  return { ok: true };
}

export async function deleteAlert(id: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db().delete(alerts).where(eq(alerts.id, id));
  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Seed the 12 canonical demo alerts from the reference screenshots.
 *
 * Idempotent — every row has a stable fingerprint, so re-running upgrades
 * `occurrences`/`lastSeenAt` on the existing row instead of inserting a
 * duplicate (`alerts_fingerprint_uq`).
 */
export async function seedDemoAlerts(): Promise<{ ok: boolean; inserted: number; updated: number }> {
  await ensureSchema();
  await requireAdmin();
  const now = new Date();
  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000);

  interface SeedAlert {
    kind: string;
    severity: "info" | "warn" | "error" | "critical";
    status: "open" | "acknowledged" | "resolved";
    title: string;
    body: string;
    payload: Record<string, unknown>;
    firstSeenAt: Date;
    lastSeenAt: Date;
    resolvedAt?: Date;
    acknowledgedAt?: Date;
  }

  const rows: SeedAlert[] = [
    {
      kind: "rank_drop",
      severity: "critical",
      status: "open",
      title: "'deep cleaning services Dubai Marina' dropped 6 positions",
      body:
        "Position slipped from #3 to #9 in Dubai Marina map pack over the last 24h. " +
        "Competitor 'Justmop' overtook the local...",
      payload: { zone: "Dubai Marina", position_before: 3, position_after: 9 },
      firstSeenAt: ago(12),
      lastSeenAt: ago(12),
    },
    {
      kind: "nap_mismatch",
      severity: "error",
      status: "open",
      title: "NAP inconsistency detected on Yellow Pages UAE",
      body:
        "Phone number on yellowpages.ae shows +971 4 555 0102, but website & GBP show " +
        "+971 4 555 0199. Fix before...",
      payload: { domain: "yellowpages.ae", meta: "Phone mismatch" },
      firstSeenAt: ago(38),
      lastSeenAt: ago(38),
    },
    {
      kind: "cwv_lcp",
      severity: "critical",
      status: "open",
      title: "LCP regression on /services/villa-deep-cleaning",
      body:
        "Largest Contentful Paint jumped from 2.1s to 4.3s on mobile (UAE region). " +
        "Hero image not preloaded after...",
      payload: { meta: "LCP 4.3s" },
      firstSeenAt: ago(60),
      lastSeenAt: ago(60),
    },
    {
      kind: "review_low_star",
      severity: "error",
      status: "open",
      title: "New 2★ review on Google Business Profile",
      body:
        "'Cleaner arrived 45 min late in JLT.' Reply within 24h to protect local ranking signals.",
      payload: { zone: "JLT", meta: "2 / 5" },
      firstSeenAt: ago(120),
      lastSeenAt: ago(120),
    },
    {
      kind: "gbp_service_area_removed",
      severity: "error",
      status: "open",
      title: "GBP service area missing: Al Barsha",
      body:
        "Al Barsha was removed from service areas after last sync. " +
        "This zone drove 12% of GBP calls last month.",
      payload: { zone: "Al Barsha", meta: "Zone removed" },
      firstSeenAt: ago(180),
      lastSeenAt: ago(180),
    },
    {
      kind: "backlink_toxic_spike",
      severity: "warn",
      status: "open",
      title: "Toxic backlink spike from spam directory",
      body:
        "27 new backlinks from low-authority UAE directory network (DA < 8). " +
        "Consider adding to Google Disavow file.",
      payload: { meta: "+27 toxic" },
      firstSeenAt: ago(300),
      lastSeenAt: ago(300),
    },
    {
      kind: "duplicate_listing",
      severity: "warn",
      status: "open",
      title: "Duplicate listing found on Connect.ae",
      body:
        "Two active profiles for 'AKS Cleaning Services' with different addresses. " +
        "Merge or claim removal to consolidate...",
      payload: { domain: "connect.ae", meta: "2 listings" },
      firstSeenAt: ago(360),
      lastSeenAt: ago(360),
    },
    {
      kind: "cwv_cls",
      severity: "error",
      status: "acknowledged",
      title: "CLS regression on /services/sofa-cleaning",
      body:
        "Cumulative Layout Shift rose to 0.24 (target < 0.1) after new booking widget was " +
        "injected above the fold.",
      payload: { meta: "CLS 0.24" },
      firstSeenAt: ago(480),
      lastSeenAt: ago(480),
      acknowledgedAt: ago(60),
    },
    {
      kind: "ssl_expiring",
      severity: "error",
      status: "open",
      title: "SSL certificate expires in 18 days",
      body:
        "akscleaning.ae SSL certificate expires on 30 July 2026. Auto-renewal is off — " +
        "manual renewal required.",
      payload: { meta: "18 days" },
      firstSeenAt: ago(540),
      lastSeenAt: ago(540),
    },
    {
      kind: "rank_drop",
      severity: "error",
      status: "open",
      title: "'maid service Downtown Dubai' fell out of top 10",
      body:
        "Dropped from #8 to #14 overnight. Content refresh recommended — page not updated in 94 days.",
      payload: { zone: "Downtown Dubai", position_before: 8, position_after: 14 },
      firstSeenAt: ago(660),
      lastSeenAt: ago(660),
    },
    {
      kind: "uptime_dip",
      severity: "warn",
      status: "resolved",
      title: "Uptime dip detected from UAE probe",
      body:
        "Site returned 503 for 4 minutes at 03:12 GST. All other regions healthy — " +
        "likely CDN edge issue in Dubai region.",
      payload: { meta: "4 min downtime" },
      firstSeenAt: ago(840),
      lastSeenAt: ago(840),
      resolvedAt: ago(60),
    },
    {
      kind: "gbp_photo_removed",
      severity: "info",
      status: "open",
      title: "GBP photo removed by Google",
      body:
        "Interior photo of Business Bay office flagged and removed. " +
        "Upload a compliant replacement to keep media score high.",
      payload: { zone: "Business Bay", meta: "1 photo removed" },
      firstSeenAt: ago(60 * 24),
      lastSeenAt: ago(60 * 24),
    },
    {
      kind: "rank_climb",
      severity: "info",
      status: "resolved",
      title: "'villa cleaning Palm Jumeirah' climbed to #2",
      body:
        "Positive movement — page now #2 in local pack, up from #5. " +
        "Consider allocating more ad-spend to capture demand.",
      payload: { zone: "Palm Jumeirah", position_before: 5, position_after: 2 },
      firstSeenAt: ago(60 * 24),
      lastSeenAt: ago(60 * 24),
      resolvedAt: ago(60 * 12),
    },
    {
      kind: "crawl_broken_links",
      severity: "warn",
      status: "acknowledged",
      title: "3 broken internal links on service pages",
      body:
        "Broken links found on deep-clean, sofa-cleaning, and move-in pages pointing " +
        "to a deleted /promo/ramadan...",
      payload: { meta: "3 x 404" },
      firstSeenAt: ago(60 * 24),
      lastSeenAt: ago(60 * 24),
      acknowledgedAt: ago(60 * 6),
    },
    {
      kind: "review_velocity_drop",
      severity: "warn",
      status: "open",
      title: "Review velocity dropped 32% week-over-week",
      body:
        "Only 9 new Google reviews this week vs 13 average. " +
        "Review-request automation may have stalled — check...",
      payload: { meta: "-32% WoW" },
      firstSeenAt: ago(60 * 48),
      lastSeenAt: ago(60 * 48),
    },
  ];

  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const fingerprint = createHash("sha256")
      .update(`${r.kind}::demo::${r.title}`)
      .digest("hex")
      .slice(0, 32);
    const existing = await db()
      .select({ id: alerts.id })
      .from(alerts)
      .where(eq(alerts.fingerprint, fingerprint))
      .limit(1);
    if (existing[0]) {
      await db()
        .update(alerts)
        .set({
          lastSeenAt: r.lastSeenAt,
          severity: r.severity,
          status: r.status,
          title: r.title,
          body: r.body,
          payload: r.payload,
          enabled: true,
          resolvedAt: r.resolvedAt ?? null,
          acknowledgedAt: r.acknowledgedAt ?? null,
        })
        .where(eq(alerts.id, existing[0].id));
      updated += 1;
    } else {
      await db().insert(alerts).values({
        kind: r.kind,
        severity: r.severity,
        status: r.status,
        fingerprint,
        title: r.title,
        body: r.body,
        payload: r.payload,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        resolvedAt: r.resolvedAt ?? null,
        acknowledgedAt: r.acknowledgedAt ?? null,
      });
      inserted += 1;
    }
  }

  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true, inserted, updated };
}

export async function bulkAckAll(): Promise<{ ok: boolean; updated: number }> {
  await ensureSchema();
  const me = await requireAdmin();
  const rows = await db()
    .update(alerts)
    .set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: me.id })
    .where(inArray(alerts.status, ["open"]))
    .returning({ id: alerts.id });
  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true, updated: rows.length };
}

export async function bulkAck(ids: string[]): Promise<{ ok: boolean; updated: number }> {
  await ensureSchema();
  const me = await requireAdmin();
  if (ids.length === 0) return { ok: true, updated: 0 };
  await db()
    .update(alerts)
    .set({ status: "acknowledged", acknowledgedAt: new Date(), acknowledgedBy: me.id })
    .where(inArray(alerts.id, ids));
  revalidatePath("/admin/alerts");
  return { ok: true, updated: ids.length };
}
