/**
 * Staged publish queue logic — schedule, list, cancel, execute.
 *
 * Hard cadence cap: max `MAX_PUBLISHES_PER_WINDOW` pages can be published
 * per `WINDOW_DAYS`-day rolling window per project. Attempts to schedule
 * beyond that return the earliest slot the cadence allows.
 *
 * The cron worker (`src/scripts/publish-scheduled.ts`) reads this table
 * every minute. For each row whose `scheduled_at` has passed:
 *   1. Re-runs the gauntlet (cheap, skips external checks)
 *   2. If verdict !== "block", calls the existing WP deploy path
 *   3. Updates the row to status='published' or 'failed'
 */

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  apiKeys,
  publishSchedule,
  siteBuildPages,
  siteBuildProjects,
  sites,
} from "@/db/schema";
import { callPlugin, WpPluginError } from "./wp-plugin-client";

export const MAX_PUBLISHES_PER_WINDOW = 8;
export const WINDOW_DAYS = 7;

/**
 * Count publishes (scheduled OR already published) in the rolling window
 * leading up to `at`. Used to enforce the cadence cap.
 */
export async function countPublishesInWindow(projectId: string, at: Date): Promise<number> {
  const windowStart = new Date(at.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db()
    .select({ id: publishSchedule.id })
    .from(publishSchedule)
    .where(
      and(
        eq(publishSchedule.projectId, projectId),
        sql`${publishSchedule.status} IN ('scheduled','publishing','published')`,
        gte(publishSchedule.scheduledAt, windowStart),
        sql`${publishSchedule.scheduledAt} <= ${at.toISOString()}::timestamptz`,
      ),
    );
  return rows.length;
}

/**
 * Compute the earliest allowed publish time for a project. If the
 * requested `desiredAt` violates the cap, return the soonest slot that
 * fits — typically the (cap+1)th day in the future from the densest
 * cluster.
 */
export async function nextAllowedSlot(projectId: string, desiredAt: Date): Promise<{ allowed: boolean; resolvedAt: Date; reason: string }> {
  const windowCount = await countPublishesInWindow(projectId, desiredAt);
  if (windowCount < MAX_PUBLISHES_PER_WINDOW) {
    return { allowed: true, resolvedAt: desiredAt, reason: `${windowCount + 1}/${MAX_PUBLISHES_PER_WINDOW} in the 7-day window` };
  }

  // Find the oldest publish that's still in the window — the cap unlocks
  // a slot one second after it falls out of the window.
  const windowStart = new Date(desiredAt.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [oldest] = await db()
    .select({ scheduledAt: publishSchedule.scheduledAt })
    .from(publishSchedule)
    .where(
      and(
        eq(publishSchedule.projectId, projectId),
        sql`${publishSchedule.status} IN ('scheduled','publishing','published')`,
        gte(publishSchedule.scheduledAt, windowStart),
      ),
    )
    .orderBy(asc(publishSchedule.scheduledAt))
    .limit(1);

  if (!oldest) {
    // Shouldn't happen given windowCount >= cap, but failsafe.
    return { allowed: true, resolvedAt: desiredAt, reason: "window edge — allowed" };
  }

  const unlockAt = new Date(oldest.scheduledAt.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000 + 1000);
  return {
    allowed: false,
    resolvedAt: unlockAt,
    reason: `cadence cap of ${MAX_PUBLISHES_PER_WINDOW}/${WINDOW_DAYS}d already reached. Earliest available slot: ${unlockAt.toISOString()}`,
  };
}

/**
 * Schedule a page for publish. Idempotent on page_id (uniqueIndex).
 *
 * - If page already has a 'published' schedule entry → returns existing row, no-op
 * - If page has a 'scheduled' entry → updates it (allows rescheduling)
 * - Enforces cadence cap unless `force:true`
 */
export async function schedulePagePublish(opts: {
  pageId: string;
  scheduledAt: Date;
  force?: boolean;
  createdBy?: string | null;
  gauntletReport?: Record<string, unknown> | null;
}): Promise<{
  ok: boolean;
  rescheduled?: boolean;
  cadence_blocked?: boolean;
  next_slot?: string;
  entry?: typeof publishSchedule.$inferSelect;
  reason?: string;
}> {
  const [page] = await db().select().from(siteBuildPages).where(eq(siteBuildPages.id, opts.pageId)).limit(1);
  if (!page) return { ok: false, reason: "Page not found" };
  if (!page.bodyMarkdown) return { ok: false, reason: "Page has no body — generate first" };

  // Cadence check
  const slot = await nextAllowedSlot(page.projectId, opts.scheduledAt);
  if (!slot.allowed && !opts.force) {
    return {
      ok: false,
      cadence_blocked: true,
      next_slot: slot.resolvedAt.toISOString(),
      reason: slot.reason,
    };
  }

  // Existing row?
  const [existing] = await db()
    .select()
    .from(publishSchedule)
    .where(eq(publishSchedule.pageId, opts.pageId))
    .limit(1);

  if (existing) {
    if (existing.status === "published") return { ok: true, rescheduled: false, entry: existing, reason: "Already published" };
    const [updated] = await db()
      .update(publishSchedule)
      .set({
        scheduledAt: opts.scheduledAt,
        status: "scheduled",
        gauntletReport: opts.gauntletReport ?? existing.gauntletReport ?? null,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(publishSchedule.id, existing.id))
      .returning();
    return { ok: true, rescheduled: true, entry: updated, reason: slot.reason };
  }

  const [created] = await db()
    .insert(publishSchedule)
    .values({
      pageId: opts.pageId,
      projectId: page.projectId,
      scheduledAt: opts.scheduledAt,
      status: "scheduled",
      gauntletReport: opts.gauntletReport ?? null,
      createdBy: opts.createdBy ?? null,
    })
    .returning();
  return { ok: true, rescheduled: false, entry: created, reason: slot.reason };
}

export async function cancelScheduledPublish(pageId: string): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await db()
    .select()
    .from(publishSchedule)
    .where(eq(publishSchedule.pageId, pageId))
    .limit(1);
  if (!row) return { ok: false, reason: "No schedule entry for this page" };
  if (row.status === "published") return { ok: false, reason: "Already published, cannot cancel" };
  await db()
    .update(publishSchedule)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(publishSchedule.id, row.id));
  return { ok: true };
}

export async function listProjectSchedule(projectId: string) {
  const rows = await db()
    .select({
      id: publishSchedule.id,
      pageId: publishSchedule.pageId,
      pageTitle: siteBuildPages.title,
      pageSlug: siteBuildPages.pageSlug,
      pageType: siteBuildPages.pageType,
      scheduledAt: publishSchedule.scheduledAt,
      status: publishSchedule.status,
      publishedAt: publishSchedule.publishedAt,
      wpPostId: publishSchedule.wpPostId,
      error: publishSchedule.error,
    })
    .from(publishSchedule)
    .innerJoin(siteBuildPages, eq(siteBuildPages.id, publishSchedule.pageId))
    .where(eq(publishSchedule.projectId, projectId))
    .orderBy(asc(publishSchedule.scheduledAt));
  return rows;
}

/** Returns the rows that are due to publish (scheduled_at <= now, status=scheduled). */
export async function fetchDueRows(now: Date = new Date()) {
  return db()
    .select()
    .from(publishSchedule)
    .where(
      and(
        eq(publishSchedule.status, "scheduled"),
        sql`${publishSchedule.scheduledAt} <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(asc(publishSchedule.scheduledAt))
    .limit(20);
}

/** Mark a row as 'publishing' (race-safe via a status transition). */
export async function claimRow(id: string): Promise<boolean> {
  const updated = await db()
    .update(publishSchedule)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(and(eq(publishSchedule.id, id), eq(publishSchedule.status, "scheduled")))
    .returning({ id: publishSchedule.id });
  return updated.length > 0;
}

export async function markPublished(id: string, wpPostId: number) {
  await db()
    .update(publishSchedule)
    .set({
      status: "published",
      wpPostId,
      publishedAt: new Date(),
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(publishSchedule.id, id));
}

export async function markFailed(id: string, error: string) {
  await db()
    .update(publishSchedule)
    .set({ status: "failed", error: error.slice(0, 500), updatedAt: new Date() })
    .where(eq(publishSchedule.id, id));
}

/** History of recent publishes — used by the chat agent's status views. */
export async function recentPublishes(projectId: string, limit = 10) {
  return db()
    .select()
    .from(publishSchedule)
    .where(and(eq(publishSchedule.projectId, projectId), eq(publishSchedule.status, "published")))
    .orderBy(desc(publishSchedule.publishedAt))
    .limit(limit);
}

// ────────── Single-page publish helper ──────────

/**
 * Publish ONE build page to its target WordPress site via the GYL Suite
 * plugin. Used by both the scheduled-publish cron and ad-hoc test runs.
 * Returns the WP post ID on success or throws on permanent failure.
 */
export async function publishSinglePage(pageId: string): Promise<{ ok: boolean; wpPostId?: number; error?: string }> {
  const [page] = await db().select().from(siteBuildPages).where(eq(siteBuildPages.id, pageId)).limit(1);
  if (!page) return { ok: false, error: "Page not found" };
  if (!page.bodyHtml && !page.bodyMarkdown) return { ok: false, error: "Page has no body content" };

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, page.projectId))
    .limit(1);
  if (!project) return { ok: false, error: "Parent project not found" };

  // Resolve target site
  let targetSite: typeof sites.$inferSelect | null = null;
  if (project.publishedSiteId) {
    const [s] = await db().select().from(sites).where(eq(sites.id, project.publishedSiteId)).limit(1);
    targetSite = s ?? null;
  } else if (project.domain) {
    const [s] = await db().select().from(sites).where(eq(sites.domain, project.domain)).limit(1);
    targetSite = s ?? null;
  }
  if (!targetSite) {
    return { ok: false, error: "No connected WordPress site for this project (set project.publishedSiteId or domain match)" };
  }

  // Verify the plugin connection
  const [key] = await db()
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.siteId, targetSite.id), eq(apiKeys.active, true)))
    .limit(1);
  if (!key) return { ok: false, error: `Site ${targetSite.slug} has no active API key — connect the plugin first` };

  // Patch <!-- IMG: slot --> markers into real <img> tags before sending to WP.
  // Approved images only — missing slots stay as comment placeholders so the
  // operator can spot gaps in the live HTML rather than silently shipping nothing.
  //
  const patchedBody = page.bodyHtml ?? "";

  const schemaJson = Array.isArray(page.schemaJson) ? page.schemaJson : [];
  const schemaHtml = schemaJson
    .map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
    .join("\n");
  const html = patchedBody + (schemaHtml ? "\n" + schemaHtml : "");

  try {
    const resp = await callPlugin<{ ok: boolean; post_id?: number; error?: string }>(targetSite.id, {
      method: "POST",
      path: page.pageType === "blog" ? "/content/create-post" : "/content/create-page",
      body: {
        title: page.title,
        slug: page.pageSlug.replace(/^\//, ""),
        content: html,
        status: "publish",
        meta_title: page.metaTitle,
        meta_description: page.metaDescription,
      },
    });
    if (!resp.ok || !resp.post_id) {
      return { ok: false, error: resp.error ?? "WP plugin returned ok:false without post_id" };
    }
    // Update the page row to status=published
    await db()
      .update(siteBuildPages)
      .set({ status: "published", wpPostId: resp.post_id, publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(siteBuildPages.id, pageId));
    return { ok: true, wpPostId: resp.post_id };
  } catch (err) {
    const msg =
      err instanceof WpPluginError
        ? `${err.reason} ${err.status}: ${err.bodyText.slice(0, 200)}`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: msg };
  }
}
