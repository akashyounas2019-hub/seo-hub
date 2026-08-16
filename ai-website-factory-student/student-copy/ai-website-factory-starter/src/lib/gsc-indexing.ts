/**
 * Indexing coverage aggregation for the /admin/gsc deep-dive page.
 *
 * Reads the pre-existing `indexing_status` table which is kept up-to-date by
 * the indexing sweep. We roll it up into the six coverage buckets Search
 * Console itself displays: indexed, not_indexed, crawled_not_indexed,
 * discovered, duplicate, excluded.
 */
import { desc, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { indexingStatus } from "@/db/schema";

export type IndexingBucket = {
  key: string;
  label: string;
  count: number;
  tone: "good" | "warn" | "bad" | "neutral";
};

const BUCKET_LABELS: Record<string, { label: string; tone: IndexingBucket["tone"] }> = {
  indexed: { label: "Indexed", tone: "good" },
  crawled_not_indexed: { label: "Crawled — not indexed", tone: "warn" },
  discovered: { label: "Discovered — not indexed", tone: "warn" },
  duplicate: { label: "Duplicate", tone: "warn" },
  excluded: { label: "Excluded", tone: "neutral" },
  not_indexed: { label: "Not indexed", tone: "bad" },
  unknown: { label: "Unknown", tone: "neutral" },
};

export async function loadIndexingCoverage(): Promise<{
  buckets: IndexingBucket[];
  total: number;
  hasData: boolean;
}> {
  const rows = await db()
    .select({
      state: indexingStatus.indexState,
      n: sql<number>`count(*)::int`,
    })
    .from(indexingStatus)
    .groupBy(indexingStatus.indexState);

  const buckets: IndexingBucket[] = rows.map((r) => ({
    key: r.state,
    label: BUCKET_LABELS[r.state]?.label ?? r.state,
    count: r.n,
    tone: BUCKET_LABELS[r.state]?.tone ?? "neutral",
  }));
  buckets.sort((a, b) => b.count - a.count);

  const total = buckets.reduce((s, b) => s + b.count, 0);
  return { buckets, total, hasData: total > 0 };
}

/**
 * Recent indexing "issues" — non-indexed rows with fresh crawl data. Used to
 * populate the Issues table on the deep-dive page.
 */
export type IndexingIssueRow = {
  url: string;
  coverageState: string | null;
  indexState: string;
  httpStatus: number | null;
  lastCheckedAt: Date | null;
  siteId: string;
};

export async function loadRecentIssues(limit = 20): Promise<IndexingIssueRow[]> {
  const rows = await db()
    .select({
      url: indexingStatus.url,
      coverageState: indexingStatus.coverageState,
      indexState: indexingStatus.indexState,
      httpStatus: indexingStatus.httpStatus,
      lastCheckedAt: indexingStatus.lastCheckedAt,
      siteId: indexingStatus.siteId,
    })
    .from(indexingStatus)
    .where(sql`${indexingStatus.indexState} <> 'indexed'`)
    .orderBy(desc(indexingStatus.lastCheckedAt))
    .limit(limit);
  return rows;
}
