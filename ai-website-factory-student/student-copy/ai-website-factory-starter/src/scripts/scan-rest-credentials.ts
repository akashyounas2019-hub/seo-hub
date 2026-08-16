/**
 * Scan PGlite for saved WordPress REST credentials. Reports metadata only —
 * never prints ciphertext or the decrypted password. Safe to run any time.
 *
 * Usage:
 *   npx tsx src/scripts/scan-rest-credentials.ts
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteCredentials, sites } from "@/db/schema";

async function main(): Promise<void> {
  await ensureSchema();
  const d = db();

  const total = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(siteCredentials);
  const active = await d
    .select({ c: sql<number>`count(*)::int` })
    .from(siteCredentials)
    .where(isNull(siteCredentials.revokedAt));
  const byStatus = await d
    .select({
      verifyStatus: sql<string>`coalesce(${siteCredentials.verifyStatus}, 'never_verified')`,
      c: sql<number>`count(*)::int`,
    })
    .from(siteCredentials)
    .groupBy(siteCredentials.verifyStatus);

  const activeRows = await d
    .select({
      credentialId: siteCredentials.id,
      siteSlug: sites.slug,
      siteDomain: sites.domain,
      username: siteCredentials.username,
      verifyStatus: siteCredentials.verifyStatus,
      verifiedAt: siteCredentials.verifiedAt,
      createdAt: siteCredentials.createdAt,
    })
    .from(siteCredentials)
    .leftJoin(sites, eq(sites.id, siteCredentials.siteId))
    .where(and(
      isNull(siteCredentials.revokedAt),
      eq(siteCredentials.kind, "wp_app_password"),
    ))
    .orderBy(desc(siteCredentials.createdAt));

  const report = {
    table_exists: true,
    total_rows: total[0]?.c ?? 0,
    active_rows: active[0]?.c ?? 0,
    rows_by_status: Object.fromEntries(byStatus.map((r) => [r.verifyStatus, r.c])),
    sites_with_active_credential: activeRows,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("SCAN_FAILED:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
