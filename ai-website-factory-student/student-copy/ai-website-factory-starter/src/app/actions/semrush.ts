"use server";

import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { trackedKeywords, keywordResearchSessions, sites } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/server-auth";
import { researchKeywords, hasSemrushKey, type SemrushResult } from "@/lib/semrush";

const DB_TO_LOCATION: Record<string, string> = {
  ca: "Canada",
  us: "United States",
  uk: "United Kingdom",
  au: "Australia",
  ae: "United Arab Emirates",
};

export async function runSemrushResearch(
  seed: string,
  database = "ae",
): Promise<SemrushResult> {
  await requireAdmin();
  return researchKeywords(seed, database, 60);
}

export async function semrushConfigured(): Promise<boolean> {
  await requireAdmin();
  return hasSemrushKey();
}

/** Add a batch of researched keywords to a site's tracked_keywords. */
export async function addResearchedKeywords(
  siteId: string,
  keywords: { keyword: string; targetUrl?: string }[],
  database = "ae",
): Promise<{ ok: boolean; added: number; error?: string }> {
  await ensureSchema();
  await requireAdmin();
  if (!siteId) return { ok: false, added: 0, error: "missing-site" };
  const [site] = await db().select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return { ok: false, added: 0, error: "site-not-found" };

  const location = DB_TO_LOCATION[database] ?? "United Arab Emirates";
  let added = 0;
  for (const k of keywords) {
    const keyword = k.keyword.trim();
    if (!keyword) continue;
    try {
      await db().insert(trackedKeywords).values({
        siteId,
        keyword,
        targetUrl: k.targetUrl?.trim() || null,
        location,
        device: "desktop",
        source: "semrush",
        enabled: true,
      });
      added++;
    } catch {
      /* duplicate / unique — skip silently */
    }
  }
  revalidatePath("/admin/keywords");
  return { ok: true, added };
}

export async function saveResearchSession(
  seed: string,
  database: string,
  result: SemrushResult,
): Promise<{ ok: boolean; id?: string }> {
  await ensureSchema();
  await requireAdmin();
  const [row] = await db()
    .insert(keywordResearchSessions)
    .values({
      seed,
      database,
      resultCount: result.keywords?.length ?? 0,
      results: result.keywords ?? [],
      clusters: result.clusters ?? [],
    })
    .returning({ id: keywordResearchSessions.id });
  return { ok: true, id: row?.id };
}

export async function getResearchHistory(): Promise<
  { id: string; seed: string; database: string; resultCount: number; createdAt: Date }[]
> {
  await ensureSchema();
  await requireAdmin();
  return db()
    .select({
      id: keywordResearchSessions.id,
      seed: keywordResearchSessions.seed,
      database: keywordResearchSessions.database,
      resultCount: keywordResearchSessions.resultCount,
      createdAt: keywordResearchSessions.createdAt,
    })
    .from(keywordResearchSessions)
    .orderBy(desc(keywordResearchSessions.createdAt))
    .limit(20);
}

export async function getResearchSession(
  id: string,
): Promise<SemrushResult | null> {
  await ensureSchema();
  await requireAdmin();
  const [row] = await db()
    .select({
      results: keywordResearchSessions.results,
      clusters: keywordResearchSessions.clusters,
      seed: keywordResearchSessions.seed,
    })
    .from(keywordResearchSessions)
    .where(eq(keywordResearchSessions.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ok: true,
    seed: row.seed,
    db: "",
    keywords: row.results as SemrushResult["keywords"],
    clusters: row.clusters as SemrushResult["clusters"],
    notes: [],
  };
}
