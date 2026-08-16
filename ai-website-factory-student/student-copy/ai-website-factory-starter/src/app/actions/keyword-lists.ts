"use server";

import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/db/client";
import { keywordLists, keywordListItems } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/server-auth";

export async function createKeywordList(
  name: string,
  description?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  await ensureSchema();
  await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Name is required" };
  const [row] = await db()
    .insert(keywordLists)
    .values({ name: name.trim(), description: description?.trim() || null })
    .returning({ id: keywordLists.id });
  revalidatePath("/admin/keyword-lists");
  return { ok: true, id: row?.id };
}

export async function getKeywordLists(): Promise<
  { id: string; name: string; description: string | null; keywordCount: number; createdAt: Date }[]
> {
  await ensureSchema();
  await requireAdmin();
  const lists = await db()
    .select({
      id: keywordLists.id,
      name: keywordLists.name,
      description: keywordLists.description,
      createdAt: keywordLists.createdAt,
    })
    .from(keywordLists)
    .orderBy(desc(keywordLists.updatedAt));

  const items = await db()
    .select({ listId: keywordListItems.listId })
    .from(keywordListItems);

  const countMap = new Map<string, number>();
  for (const item of items) {
    countMap.set(item.listId, (countMap.get(item.listId) ?? 0) + 1);
  }

  return lists.map((l) => ({
    ...l,
    keywordCount: countMap.get(l.id) ?? 0,
  }));
}

export async function getKeywordListWithItems(id: string): Promise<{
  list: { id: string; name: string; description: string | null; createdAt: Date } | null;
  items: { id: string; keyword: string; volume: number | null; difficulty: number | null; cpc: string | null; intent: string | null; addedAt: Date }[];
}> {
  await ensureSchema();
  await requireAdmin();
  const [list] = await db()
    .select({
      id: keywordLists.id,
      name: keywordLists.name,
      description: keywordLists.description,
      createdAt: keywordLists.createdAt,
    })
    .from(keywordLists)
    .where(eq(keywordLists.id, id))
    .limit(1);
  if (!list) return { list: null, items: [] };

  const items = await db()
    .select({
      id: keywordListItems.id,
      keyword: keywordListItems.keyword,
      volume: keywordListItems.volume,
      difficulty: keywordListItems.difficulty,
      cpc: keywordListItems.cpc,
      intent: keywordListItems.intent,
      addedAt: keywordListItems.addedAt,
    })
    .from(keywordListItems)
    .where(eq(keywordListItems.listId, id))
    .orderBy(desc(keywordListItems.addedAt));

  return { list, items };
}

export async function saveKeywordsToList(
  listId: string,
  keywords: { keyword: string; volume?: number; difficulty?: number; cpc?: number; intent?: string }[],
): Promise<{ ok: boolean; added: number; error?: string }> {
  await ensureSchema();
  await requireAdmin();
  if (!listId) return { ok: false, added: 0, error: "missing-list" };

  let added = 0;
  for (const k of keywords) {
    if (!k.keyword.trim()) continue;
    try {
      await db().insert(keywordListItems).values({
        listId,
        keyword: k.keyword.trim(),
        volume: k.volume ?? null,
        difficulty: k.difficulty ?? null,
        cpc: k.cpc != null ? String(k.cpc) : null,
        intent: k.intent ?? null,
      });
      added++;
    } catch {
      /* duplicate — skip */
    }
  }
  await db()
    .update(keywordLists)
    .set({ updatedAt: new Date() })
    .where(eq(keywordLists.id, listId));
  revalidatePath("/admin/keyword-lists");
  return { ok: true, added };
}

export async function deleteKeywordList(id: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db().delete(keywordLists).where(eq(keywordLists.id, id));
  revalidatePath("/admin/keyword-lists");
  return { ok: true };
}

export async function removeKeywordFromList(itemId: string): Promise<{ ok: boolean }> {
  await ensureSchema();
  await requireAdmin();
  await db().delete(keywordListItems).where(eq(keywordListItems.id, itemId));
  revalidatePath("/admin/keyword-lists");
  return { ok: true };
}

export async function removeKeywordsFromList(itemIds: string[]): Promise<{ ok: boolean; removed: number }> {
  await ensureSchema();
  await requireAdmin();
  let removed = 0;
  for (const id of itemIds) {
    await db().delete(keywordListItems).where(eq(keywordListItems.id, id));
    removed++;
  }
  revalidatePath("/admin/keyword-lists");
  return { ok: true, removed };
}

export async function addKeywordToList(
  listId: string,
  keyword: string,
): Promise<{ ok: boolean; error?: string }> {
  await ensureSchema();
  await requireAdmin();
  if (!keyword.trim()) return { ok: false, error: "Keyword is required" };
  try {
    await db().insert(keywordListItems).values({
      listId,
      keyword: keyword.trim(),
    });
    await db()
      .update(keywordLists)
      .set({ updatedAt: new Date() })
      .where(eq(keywordLists.id, listId));
    revalidatePath("/admin/keyword-lists");
    return { ok: true };
  } catch {
    return { ok: false, error: "Keyword may already exist in this list" };
  }
}
