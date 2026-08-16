"use server";

import { sql } from "drizzle-orm";
import { fetchPageSpeed, type PageSpeedResult } from "@/lib/pagespeed";
import { db, ensureSchema } from "@/db/client";
import { orgSettings } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { requireAdmin } from "@/lib/server-auth";

export async function analyzePageSpeed(
  url: string,
  strategy: "mobile" | "desktop",
): Promise<{ ok: true; data: PageSpeedResult } | { ok: false; error: string }> {
  await ensureSchema();
  await requireAdmin();

  // Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    return { ok: false, error: "invalid-url" };
  }

  try {
    const [row] = await db().select({ pagespeedApiKeyCiphertext: orgSettings.pagespeedApiKeyCiphertext }).from(orgSettings).where(sql`${orgSettings.id} = 'singleton'`).limit(1);
    const apiKey = row?.pagespeedApiKeyCiphertext ? decrypt(row.pagespeedApiKeyCiphertext) : undefined;
    const result = await fetchPageSpeed(parsed.toString(), strategy, apiKey);
    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown-error";
    if (message.includes("429")) {
      return { ok: false, error: "rate-limited-429: PageSpeed quota exceeded — configure an API key at /admin/settings (APIs section) to raise the limit." };
    }
    return { ok: false, error: message };
  }
}
