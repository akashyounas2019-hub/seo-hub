/**
 * G8 — Refresh recommender.
 *
 * After tracked_keywords.weeks_off_pN counters tick over, propose a
 * fix:rewrite_page job for keywords stuck off page 1/2/3 for too long.
 * Defaults:
 *   - weeks_off_p1 >= 4   → propose rewrite
 *   - weeks_off_p3 >= 8   → priority=high
 *
 * Proposals land in fix_proposals (pending), not claude_jobs directly, so
 * the operator (or auto-approve rule) decides whether to dispatch.
 */
import { and, eq, gte, isNull, or } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { fixProposals, sites, trackedKeywords } from "@/db/schema";

export async function recommendKeywordRefreshes(opts: { p1Threshold?: number; p3Threshold?: number } = {}): Promise<{ proposed: number }> {
  await ensureSchema();
  const p1 = opts.p1Threshold ?? 4;
  const p3 = opts.p3Threshold ?? 8;

  const candidates = await db()
    .select({
      id: trackedKeywords.id,
      siteId: trackedKeywords.siteId,
      keyword: trackedKeywords.keyword,
      targetUrl: trackedKeywords.targetUrl,
      weeksOffP1: trackedKeywords.weeksOffP1,
      weeksOffP3: trackedKeywords.weeksOffP3,
      refreshFlaggedAt: trackedKeywords.refreshFlaggedAt,
      siteDomain: sites.domain,
    })
    .from(trackedKeywords)
    .leftJoin(sites, eq(sites.id, trackedKeywords.siteId))
    .where(and(
      eq(trackedKeywords.enabled, true),
      gte(trackedKeywords.weeksOffP1, p1),
      or(isNull(trackedKeywords.refreshFlaggedAt), eq(trackedKeywords.refreshFlaggedAt, new Date(0))),
    ))
    .limit(500);

  let proposed = 0;
  for (const c of candidates) {
    if (!c.targetUrl) continue;
    const high = c.weeksOffP3 >= p3;
    await db().insert(fixProposals).values({
      siteId: c.siteId,
      issueId: null,
      fixKind: "fix:rewrite_page",
      input: {
        url: c.targetUrl,
        keyword: c.keyword,
        weeksOffP1: c.weeksOffP1,
        weeksOffP3: c.weeksOffP3,
        reason: high ? "stuck off page 3+ for 8+ weeks" : "off page 1 for 4+ weeks",
      },
      label: `Rewrite "${c.keyword}" — off P1 ${c.weeksOffP1}w`,
      preview: `${c.siteDomain ?? ""} ${c.targetUrl}`,
      priority: high ? "high" : "normal",
      status: "pending",
    });
    await db().update(trackedKeywords).set({ refreshFlaggedAt: new Date() }).where(eq(trackedKeywords.id, c.id));
    proposed++;
  }
  return { proposed };
}
