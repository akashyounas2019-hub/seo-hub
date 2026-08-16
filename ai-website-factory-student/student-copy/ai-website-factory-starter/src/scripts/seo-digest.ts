/**
 * Weekly SEO digest — keyword ranking deltas per site.
 *
 * Runs every Monday at 07:00 UTC via the `gyl-cron` container. For each
 * admin / manager, builds a digest of:
 *
 *   - Sites with biggest position GAINS this week (vs prior week)
 *   - Sites with biggest position DROPS this week
 *   - Per-site: top 5 query winners, top 5 query losers, new entries, dropped queries
 *   - Aggregate impressions + clicks WoW
 *
 * Reads from `traffic_snapshots` rows that `sync-gsc` populates daily.
 * GSC's query-level data lives in the `detail.top_queries` JSON column.
 *
 * Distribution: per-user notify() — respects telegram + email opt-in.
 *
 * Usage:
 *   npm run seo:digest                          # weekly digest for everyone
 *   npm run seo:digest -- --user=<email>        # only one recipient
 *   npm run seo:digest -- --dry                 # print to stdout, don't notify
 */
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { sites, trafficSnapshots, userPrefs, users, type Site, type User } from "../db/schema";
import { notify } from "../lib/notifications";
import { getVisibility } from "../lib/permissions";

interface RunArgs {
  dryRun: boolean;
  userFilterEmail?: string;
}

interface QueryRow {
  keys?: string[];
  query?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface PerSiteWindow {
  totalClicks: number;
  totalImpressions: number;
  // query → averaged metrics across the window
  queries: Map<string, { clicks: number; impressions: number; position: number; days: number }>;
}

function parseArgs(argv: string[]): RunArgs {
  const out: RunArgs = { dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === "--dry" || a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--user=")) out.userFilterEmail = a.slice("--user=".length);
  }
  return out;
}

function emptyWindow(): PerSiteWindow {
  return { totalClicks: 0, totalImpressions: 0, queries: new Map() };
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Load the last 14 daily snapshots for a site and split them into
 * "this week" (days 1–7 prior to today) and "prior week" (days 8–14).
 */
async function loadTwoWeekWindows(siteId: string): Promise<{ thisWeek: PerSiteWindow; priorWeek: PerSiteWindow }> {
  const today = new Date();
  const startOfThisWeek = new Date(today.getTime() - 7 * 24 * 3600_000);
  const startOfPriorWeek = new Date(today.getTime() - 14 * 24 * 3600_000);
  const startStr = yyyymmdd(startOfPriorWeek);

  const rows = await db()
    .select({
      snapshotDate: trafficSnapshots.snapshotDate,
      metrics: trafficSnapshots.metrics,
      detail: trafficSnapshots.detail,
    })
    .from(trafficSnapshots)
    .where(and(eq(trafficSnapshots.siteId, siteId), eq(trafficSnapshots.source, "gsc"), gte(trafficSnapshots.snapshotDate, startStr)))
    .orderBy(asc(trafficSnapshots.snapshotDate));

  const thisWeek = emptyWindow();
  const priorWeek = emptyWindow();

  for (const row of rows) {
    const day = new Date(row.snapshotDate + "T00:00:00Z");
    const bucket = day >= startOfThisWeek ? thisWeek : priorWeek;
    const m = row.metrics ?? {};
    bucket.totalClicks += Number(m.clicks ?? 0);
    bucket.totalImpressions += Number(m.impressions ?? 0);

    const topQueries = ((row.detail as Record<string, unknown>)?.top_queries as QueryRow[] | undefined) ?? [];
    for (const q of topQueries) {
      const text = (q.keys?.[0] ?? q.query ?? "").trim();
      if (!text) continue;
      const existing = bucket.queries.get(text) ?? { clicks: 0, impressions: 0, position: 0, days: 0 };
      existing.clicks += q.clicks ?? 0;
      existing.impressions += q.impressions ?? 0;
      existing.position += q.position ?? 0;
      existing.days += 1;
      bucket.queries.set(text, existing);
    }
  }
  return { thisWeek, priorWeek };
}

interface QueryDelta {
  query: string;
  positionThis: number;
  positionPrior: number | null;  // null = new entry
  positionDelta: number;          // negative = improved (lower position is better)
  clicksThis: number;
  clicksPrior: number;
  impressionsThis: number;
}

function computeDeltas(thisWeek: PerSiteWindow, priorWeek: PerSiteWindow): QueryDelta[] {
  const out: QueryDelta[] = [];
  for (const [query, t] of thisWeek.queries) {
    const tPos = t.days > 0 ? t.position / t.days : 0;
    const p = priorWeek.queries.get(query);
    const pPos = p && p.days > 0 ? p.position / p.days : null;
    out.push({
      query,
      positionThis: tPos,
      positionPrior: pPos,
      positionDelta: pPos === null ? 0 : tPos - pPos,
      clicksThis: t.clicks,
      clicksPrior: p?.clicks ?? 0,
      impressionsThis: t.impressions,
    });
  }
  // Dropped queries — appeared last week, not this week.
  for (const [query, p] of priorWeek.queries) {
    if (thisWeek.queries.has(query)) continue;
    const pPos = p.days > 0 ? p.position / p.days : 0;
    out.push({
      query,
      positionThis: 0,
      positionPrior: pPos,
      positionDelta: 100, // sentinel — dropped out of the top set
      clicksThis: 0,
      clicksPrior: p.clicks,
      impressionsThis: 0,
    });
  }
  return out;
}

function classify(deltas: QueryDelta[]) {
  const gainers = deltas
    .filter((d) => d.positionPrior !== null && d.positionDelta <= -2 && d.impressionsThis >= 5)
    .sort((a, b) => a.positionDelta - b.positionDelta)
    .slice(0, 5);
  const losers = deltas
    .filter((d) => d.positionPrior !== null && d.positionDelta >= 2 && d.positionDelta < 100)
    .sort((a, b) => b.positionDelta - a.positionDelta)
    .slice(0, 5);
  const newEntries = deltas
    .filter((d) => d.positionPrior === null && d.positionThis <= 20 && d.impressionsThis >= 3)
    .sort((a, b) => a.positionThis - b.positionThis)
    .slice(0, 5);
  const dropped = deltas
    .filter((d) => d.positionDelta === 100)
    .sort((a, b) => b.clicksPrior - a.clicksPrior)
    .slice(0, 5);
  return { gainers, losers, newEntries, dropped };
}

function renderSiteSection(site: Site, windows: { thisWeek: PerSiteWindow; priorWeek: PerSiteWindow }): string {
  const deltas = computeDeltas(windows.thisWeek, windows.priorWeek);
  const { gainers, losers, newEntries, dropped } = classify(deltas);
  const clicksDelta = windows.thisWeek.totalClicks - windows.priorWeek.totalClicks;
  const imprDelta = windows.thisWeek.totalImpressions - windows.priorWeek.totalImpressions;

  const lines: string[] = [];
  lines.push(`### ${site.name} (\`${site.slug}\`)`);
  lines.push(
    `Clicks: ${windows.thisWeek.totalClicks} (${formatDelta(clicksDelta)}) · ` +
      `Impressions: ${windows.thisWeek.totalImpressions} (${formatDelta(imprDelta)})`,
  );

  if (gainers.length > 0) {
    lines.push("");
    lines.push("**Top movers up:**");
    for (const g of gainers) {
      lines.push(
        `- \`${g.query}\` — pos ${g.positionPrior!.toFixed(1)} → ${g.positionThis.toFixed(1)} (${formatPositionDelta(g.positionDelta)})`,
      );
    }
  }
  if (losers.length > 0) {
    lines.push("");
    lines.push("**Top movers down:**");
    for (const l of losers) {
      lines.push(
        `- \`${l.query}\` — pos ${l.positionPrior!.toFixed(1)} → ${l.positionThis.toFixed(1)} (${formatPositionDelta(l.positionDelta)})`,
      );
    }
  }
  if (newEntries.length > 0) {
    lines.push("");
    lines.push("**New in top 20:**");
    for (const n of newEntries) {
      lines.push(`- \`${n.query}\` — pos ${n.positionThis.toFixed(1)} (${n.impressionsThis} impressions)`);
    }
  }
  if (dropped.length > 0) {
    lines.push("");
    lines.push("**Dropped out:**");
    for (const d of dropped) {
      lines.push(`- \`${d.query}\` — was pos ${d.positionPrior!.toFixed(1)} with ${d.clicksPrior} clicks`);
    }
  }
  if (gainers.length === 0 && losers.length === 0 && newEntries.length === 0 && dropped.length === 0) {
    lines.push("_No meaningful ranking changes this week._");
  }
  return lines.join("\n");
}

function formatDelta(n: number): string {
  if (n === 0) return "no change";
  return n > 0 ? `+${n}` : `${n}`;
}

function formatPositionDelta(n: number): string {
  // GSC position: lower is better. So negative delta = improved.
  if (n < 0) return `improved by ${(-n).toFixed(1)}`;
  return `dropped by ${n.toFixed(1)}`;
}

async function buildDigestForUser(user: User, allSites: Site[]): Promise<string | null> {
  const visibility = await getVisibility(user);
  const visibleSites =
    visibility.kind === "scoped"
      ? allSites.filter((s) => visibility.siteIds.includes(s.id))
      : allSites;
  if (visibleSites.length === 0) return null;

  const sections: string[] = [];
  for (const site of visibleSites) {
    const windows = await loadTwoWeekWindows(site.id);
    // Skip sites with no GSC data — the digest stays focused on what
    // moved, not on what we don't have.
    if (windows.thisWeek.queries.size === 0 && windows.priorWeek.queries.size === 0) continue;
    sections.push(renderSiteSection(site, windows));
  }
  if (sections.length === 0) {
    return null;
  }

  const intro = `# Weekly SEO digest — week of ${yyyymmdd(new Date())}\n\n${sections.length} site${sections.length === 1 ? "" : "s"} with ranking activity.\n\n`;
  return intro + sections.join("\n\n---\n\n");
}

async function main(): Promise<void> {
  await ensureSchema();
  const args = parseArgs(process.argv);

  const allSites = await db().select().from(sites).orderBy(sites.slug);
  if (allSites.length === 0) {
    console.log("[seo:digest] no sites — nothing to do");
    return;
  }

  // Who gets the digest? Anyone with notify_weekly_digest = true (default).
  let recipients = await db()
    .select()
    .from(users)
    .leftJoin(userPrefs, eq(userPrefs.userId, users.id))
    .where(args.userFilterEmail ? eq(users.email, args.userFilterEmail) : undefined);

  // Filter to opt-in.
  recipients = recipients.filter((row) => {
    const p = row.user_prefs;
    if (!p) return true; // default opt-in
    return p.notifyWeeklyDigest !== false;
  });

  if (recipients.length === 0) {
    console.log("[seo:digest] no opted-in recipients");
    return;
  }

  let sent = 0;
  let skipped = 0;
  for (const row of recipients) {
    const user = row.users as User;
    const body = await buildDigestForUser(user, allSites);
    if (!body) {
      skipped += 1;
      continue;
    }
    if (args.dryRun) {
      console.log(`\n=== ${user.email} ===\n${body}\n`);
      continue;
    }
    const result = await notify({
      user,
      kind: "seo_weekly_digest",
      title: `SEO weekly digest — ${yyyymmdd(new Date())}`,
      body,
      href: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/admin/seo` : undefined,
    });
    sent += 1;
    console.log(
      `[seo:digest] ${user.email} · telegram=${result.telegram.sent} email=${result.email.sent} in-app=${result.inApp.sent}`,
    );
  }
  console.log(`[seo:digest] done · ${sent} sent · ${skipped} skipped (no data)`);
  // Touch inArray so it can be used by future scope filters without lint warnings.
  void inArray;
}

main().catch((err) => {
  console.error("[seo:digest] crashed:", err);
  process.exit(1);
});
