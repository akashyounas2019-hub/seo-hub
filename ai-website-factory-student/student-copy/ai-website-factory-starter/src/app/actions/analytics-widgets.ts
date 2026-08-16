"use server";

/**
 * Add/remove/toggle/reorder widgets on the /admin/analytics dashboard.
 * All actions revalidate `/admin/analytics` so the grid re-renders.
 */
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { analyticsWidgets } from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import {
  WIDGET_CATALOG,
  findWidgetCatalogEntry,
  type WidgetKind,
} from "@/lib/analytics-widget-catalog";

export async function addAnalyticsWidget(
  kind: WidgetKind,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  await ensureSchema();
  const me = await requireAdmin();
  const entry = findWidgetCatalogEntry(kind);
  if (!entry) return { ok: false, error: "unknown-widget-kind" };

  // Push to the end of the current list so new widgets land at the bottom.
  const [tail] = await db()
    .select({ position: analyticsWidgets.position })
    .from(analyticsWidgets)
    .orderBy(desc(analyticsWidgets.position))
    .limit(1);
  const nextPos = (tail?.position ?? 0) + 10;

  const [row] = await db()
    .insert(analyticsWidgets)
    .values({
      kind,
      label: entry.name,
      settings: entry.defaultSettings ?? {},
      position: nextPos,
      enabled: true,
      createdBy: me.id,
    })
    .returning({ id: analyticsWidgets.id });

  revalidatePath("/admin/analytics");
  return { ok: true, id: row?.id };
}

export async function removeAnalyticsWidget(id: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db().delete(analyticsWidgets).where(eq(analyticsWidgets.id, id));
  revalidatePath("/admin/analytics");
  return { ok: true };
}

export async function toggleAnalyticsWidget(
  id: string,
  enabled: boolean,
): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db()
    .update(analyticsWidgets)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(analyticsWidgets.id, id));
  revalidatePath("/admin/analytics");
  return { ok: true };
}

export async function renameAnalyticsWidget(
  id: string,
  label: string,
): Promise<{ ok: boolean; error?: string }> {
  await ensureSchema();
  await requireAdmin();
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "label-required" };
  await db()
    .update(analyticsWidgets)
    .set({ label: trimmed, updatedAt: new Date() })
    .where(eq(analyticsWidgets.id, id));
  revalidatePath("/admin/analytics");
  return { ok: true };
}

/** For the catalog picker — echoes the fixed list. */
export async function listWidgetCatalog(): Promise<typeof WIDGET_CATALOG> {
  return WIDGET_CATALOG;
}
