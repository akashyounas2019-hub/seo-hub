/**
 * P1 — Executive weekly report.
 *
 * Generates a Markdown summary covering the last 7 days across the entire
 * site network: composite scores (network + per-site), WoW deltas, top
 * movers, leads + revenue + fixes, and the hot/cold lists.
 *
 * Delivery channels (best-effort, all independent):
 *  - Telegram DM to every admin user with `telegram_chat_id` set + admin chat
 *  - Email to every admin user with an `email` value
 *  - Markdown file written to /var/log/gyl/weekly-report-<YYYY-MM-DD>.md
 *
 * Run via the Monday 06:00 UTC cron (see deploy/crontab) or manually:
 *   npm run weekly:report
 *   npm run weekly:report -- --dry-run   # log only, no notifications
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import {
  leads,
  notifications,
  payments,
  seoActions,
  siteScores,
  sites,
  userPrefs,
  users,
} from "../db/schema";
import { sendMail } from "../lib/email";
import { sendMessage as sendTelegram, TelegramNotConfiguredError } from "../lib/telegram";
import { getNetworkScores, SCORE_KEYS, type ScoreKey } from "../lib/scoring";
import { formatCents } from "../lib/pricing";

const DAY_MS = 24 * 3600_000;
const dryRun = process.argv.includes("--dry-run");

const SCORE_LABELS: Record<ScoreKey, string> = {
  site_health: "Site health",
  seo: "SEO",
  design_freshness: "Design",
  competitor_pressure: "Competitor pressure",
  content_decay: "Content decay",
  local_seo_completeness: "Local SEO",
};

async function buildReport(): Promise<{ md: string; tg: string; subject: string }> {
  const d = db();
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const lastWeekStart = new Date(now.getTime() - 14 * DAY_MS);
  const today = now.toISOString().slice(0, 10);
  const weekAgoStr = weekStart.toISOString().slice(0, 10);

  // Network scores
  const network = await getNetworkScores();

  // Per-site composite
  const rows = await d
    .select({
      siteId: siteScores.siteId,
      scoreKey: siteScores.scoreKey,
      value: siteScores.value,
      date: siteScores.snapshotDate,
    })
    .from(siteScores)
    .where(sql`${siteScores.snapshotDate} >= ${weekAgoStr}`);
  const bySite = new Map<string, { today: Map<string, number>; weekAgo: Map<string, number> }>();
  for (const r of rows) {
    if (!bySite.has(r.siteId)) bySite.set(r.siteId, { today: new Map(), weekAgo: new Map() });
    const slot = bySite.get(r.siteId)!;
    if (r.date === today) slot.today.set(r.scoreKey, r.value);
    else if (r.date <= weekAgoStr) slot.weekAgo.set(r.scoreKey, r.value);
  }
  const sitesList = await d.select({ id: sites.id, slug: sites.slug, name: sites.name }).from(sites);
  const siteRollup = sitesList.map((s) => {
    const slot = bySite.get(s.id);
    const todayVals = slot ? Array.from(slot.today.values()) : [];
    const weekAgoVals = slot ? Array.from(slot.weekAgo.values()) : [];
    const composite = todayVals.length > 0 ? Math.round(todayVals.reduce((a, b) => a + b, 0) / todayVals.length) : null;
    const compositeWeekAgo = weekAgoVals.length > 0 ? Math.round(weekAgoVals.reduce((a, b) => a + b, 0) / weekAgoVals.length) : null;
    const delta = composite !== null && compositeWeekAgo !== null ? composite - compositeWeekAgo : null;
    return { ...s, composite, delta };
  });
  const ranked = siteRollup.filter((s) => s.composite !== null).sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
  const hot = ranked.slice(0, 5);
  const cold = ranked.slice().reverse().slice(0, 5);
  const movers = siteRollup
    .filter((s) => s.delta !== null)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    .slice(0, 5);
  const overallComposite = ranked.length > 0 ? Math.round(ranked.reduce((a, b) => a + (b.composite ?? 0), 0) / ranked.length) : null;

  // KPIs
  const [leadsRow] = await d
    .select({
      thisWeek: sql<number>`count(*) filter (where ${leads.createdAt} >= ${weekStart.toISOString()}::timestamptz)::int`,
      lastWeek: sql<number>`count(*) filter (where ${leads.createdAt} >= ${lastWeekStart.toISOString()}::timestamptz and ${leads.createdAt} < ${weekStart.toISOString()}::timestamptz)::int`,
    })
    .from(leads);
  const [revRow] = await d
    .select({
      thisWeek: sql<number>`coalesce(sum(amount_cents::bigint) filter (where ${payments.receivedAt} >= ${weekStart.toISOString()}::timestamptz and ${payments.status} = 'succeeded'), 0)::bigint`,
      lastWeek: sql<number>`coalesce(sum(amount_cents::bigint) filter (where ${payments.receivedAt} >= ${lastWeekStart.toISOString()}::timestamptz and ${payments.receivedAt} < ${weekStart.toISOString()}::timestamptz and ${payments.status} = 'succeeded'), 0)::bigint`,
    })
    .from(payments);
  const [fixesRow] = await d
    .select({
      thisWeek: sql<number>`count(*) filter (where ${seoActions.createdAt} >= ${weekStart.toISOString()}::timestamptz and ${seoActions.success} = true)::int`,
      lastWeek: sql<number>`count(*) filter (where ${seoActions.createdAt} >= ${lastWeekStart.toISOString()}::timestamptz and ${seoActions.createdAt} < ${weekStart.toISOString()}::timestamptz and ${seoActions.success} = true)::int`,
    })
    .from(seoActions);

  const leadsThis = leadsRow?.thisWeek ?? 0;
  const leadsLast = leadsRow?.lastWeek ?? 0;
  const revThis = Number(revRow?.thisWeek ?? 0);
  const revLast = Number(revRow?.lastWeek ?? 0);
  const fixesThis = fixesRow?.thisWeek ?? 0;
  const fixesLast = fixesRow?.lastWeek ?? 0;

  const arrow = (n: number) => (n > 0 ? "▲" : n < 0 ? "▼" : "·");
  const subject = `[GYL] Executive weekly — ${today} (composite ${overallComposite ?? "—"})`;

  let md = "";
  md += `# Executive weekly — week ending ${today}\n\n`;
  md += `## Headlines\n\n`;
  md += `- **Network composite**: ${overallComposite ?? "—"} (avg of all 6 dimensions across ${ranked.length} sites)\n`;
  md += `- **Leads**: ${leadsThis} ${arrow(leadsThis - leadsLast)} ${Math.abs(leadsThis - leadsLast)} vs last week (${leadsLast})\n`;
  md += `- **Revenue**: ${formatCents(revThis)} ${arrow(revThis - revLast)} ${formatCents(Math.abs(revThis - revLast))} vs last week\n`;
  md += `- **SEO fixes applied**: ${fixesThis} ${arrow(fixesThis - fixesLast)} ${Math.abs(fixesThis - fixesLast)} vs last week\n\n`;

  md += `## Network scores\n\n`;
  md += `| Dimension | Value | WoW |\n|---|---:|---:|\n`;
  for (const s of network) {
    const v = s.current === null ? "—" : String(s.current);
    const w = s.delta === null ? "—" : `${arrow(s.delta)} ${Math.abs(s.delta)}`;
    md += `| ${SCORE_LABELS[s.key]} | ${v} | ${w} |\n`;
  }
  md += `\n`;

  if (movers.length > 0) {
    md += `## Biggest movers\n\n`;
    for (const m of movers) {
      md += `- ${m.name} — ${m.composite} ${arrow(m.delta ?? 0)} ${Math.abs(m.delta ?? 0)}\n`;
    }
    md += `\n`;
  }

  if (hot.length > 0) {
    md += `## Top 5 performing\n\n`;
    hot.forEach((s, i) => {
      md += `${i + 1}. ${s.name} — ${s.composite}\n`;
    });
    md += `\n`;
  }
  if (cold.length > 0) {
    md += `## Bottom 5 — needs attention\n\n`;
    cold.forEach((s, i) => {
      md += `${i + 1}. ${s.name} — ${s.composite}\n`;
    });
    md += `\n`;
  }

  md += `## Per-site rollup\n\n`;
  md += `| Site | Composite | WoW |\n|---|---:|---:|\n`;
  for (const s of ranked) {
    const w = s.delta === null ? "—" : `${arrow(s.delta)} ${Math.abs(s.delta)}`;
    md += `| ${s.name} | ${s.composite} | ${w} |\n`;
  }
  md += `\n_Auto-generated by \`npm run weekly:report\` — see /admin/reports/weekly for the live version._\n`;

  // Concise Telegram payload (Telegram has a 4096 char limit so we trim).
  let tg = "";
  tg += `*GYL Executive weekly — ${today}*\n\n`;
  tg += `Composite: *${overallComposite ?? "—"}*\n`;
  tg += `Leads: ${leadsThis} (${arrow(leadsThis - leadsLast)}${Math.abs(leadsThis - leadsLast)})\n`;
  tg += `Revenue: ${formatCents(revThis)} (${arrow(revThis - revLast)}${formatCents(Math.abs(revThis - revLast))})\n`;
  tg += `Fixes: ${fixesThis} (${arrow(fixesThis - fixesLast)}${Math.abs(fixesThis - fixesLast)})\n\n`;
  tg += `Scores (network avg):\n`;
  for (const s of network) {
    const v = s.current === null ? "—" : String(s.current);
    const w = s.delta === null ? "" : `  ${arrow(s.delta)}${Math.abs(s.delta)}`;
    tg += `· ${SCORE_LABELS[s.key]}: ${v}${w}\n`;
  }
  if (movers.length > 0) {
    tg += `\nMovers:\n`;
    for (const m of movers) tg += `· ${m.name}: ${m.composite} (${arrow(m.delta ?? 0)}${Math.abs(m.delta ?? 0)})\n`;
  }
  tg += `\nFull report: /admin/reports/weekly`;

  return { md, tg, subject };
}

async function writeFile(md: string, today: string): Promise<string | null> {
  const dir = process.env.WEEKLY_REPORT_DIR ?? "/var/log/gyl";
  try {
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `weekly-report-${today}.md`);
    await fs.writeFile(file, md, "utf8");
    return file;
  } catch (err) {
    console.warn("[weekly] could not write file:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function fanout(tg: string, md: string, subject: string) {
  const adminUsers = await db()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      telegramChatId: userPrefs.telegramChatId,
      telegramOptIn: userPrefs.telegramOptIn,
      weeklyOptIn: userPrefs.notifyWeeklyDigest,
    })
    .from(users)
    .leftJoin(userPrefs, eq(userPrefs.userId, users.id))
    .where(eq(users.role, "admin"));

  let tgSent = 0;
  let tgFail = 0;
  let mailSent = 0;
  let mailFail = 0;

  for (const u of adminUsers) {
    // Skip if user opted out of weekly digests entirely.
    if (u.weeklyOptIn === false) continue;
    // Telegram
    if (u.telegramChatId && u.telegramOptIn !== false) {
      try {
        await sendTelegram(u.telegramChatId, tg);
        tgSent++;
      } catch (err) {
        if (err instanceof TelegramNotConfiguredError) {
          // Org doesn't have Telegram set up — silent.
        } else {
          tgFail++;
          console.warn(`[weekly] telegram → ${u.email} failed:`, err instanceof Error ? err.message : err);
        }
      }
    }
    // Email
    if (u.email) {
      const res = await sendMail({
        to: u.email,
        subject,
        text: md,
        html: markdownToHtml(md),
      });
      if (res.ok) mailSent++;
      else if (res.error !== "smtp-not-configured") mailFail++;
    }
    // Notifications bell (in-app)
    try {
      await db().insert(notifications).values({
        recipientId: u.id,
        kind: "weekly_report",
        title: "Executive weekly report",
        body: tg.slice(0, 500),
        link: "/admin/reports/weekly",
      });
    } catch {
      // Non-fatal
    }
  }
  return { tgSent, tgFail, mailSent, mailFail };
}

function markdownToHtml(md: string): string {
  // Minimal MD → HTML for emails. We don't need full fidelity here — just
  // headers, bullets, bold, and tables look reasonable in any client.
  let html = md
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.*)$/gm, "<li>$1</li>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\|(.+)\|/g, (m) => `<tr>${m.split("|").filter(Boolean).map((c) => `<td>${c.trim()}</td>`).join("")}</tr>`)
    .replace(/\n\n/g, "</p><p>");
  return `<html><body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:760px;margin:24px auto;color:#1a1a1a;"><p>${html}</p></body></html>`;
}

async function main() {
  await ensureSchema();
  console.log("[weekly] building report…");
  const { md, tg, subject } = await buildReport();
  const today = new Date().toISOString().slice(0, 10);
  const file = await writeFile(md, today);
  if (file) console.log(`[weekly] wrote ${file}`);
  if (dryRun) {
    console.log("[weekly] --dry-run — not sending notifications");
    console.log("[weekly] markdown preview ↓\n" + md.slice(0, 800));
    return;
  }
  const { tgSent, tgFail, mailSent, mailFail } = await fanout(tg, md, subject);
  console.log(`[weekly] delivery — telegram ok=${tgSent} fail=${tgFail}, email ok=${mailSent} fail=${mailFail}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[weekly] fatal", err);
    process.exit(1);
  });
