/**
 * Daily digest worker. Collects yesterday's activity across the network and
 * asks Claude to write a concise summary for the admin + each team manager.
 * Drops the result into `notifications`.
 *
 * Usage: npm run ai:digest
 * Suggested cron: 0 7 * * *  (run at 7am local — admin opens the dashboard, sees the digest)
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import {
  leads,
  notifications,
  sites,
  tasks,
  taskAudits,
  users,
} from "../db/schema";
import {
  getAuditAndDigestFlags,
  getLLMClient,
  LLMNotConfiguredError,
} from "../lib/llm";
import { emailIfOptedIn } from "../lib/notify-email";

const DIGEST_PROMPT = `You are the GYL Platform digest writer. You're given JSON snapshots of yesterday's activity across a network of Dubai-based cleaning & maintenance services websites. Write a daily digest for the recipient.

Voice:
- Direct, actionable, no fluff.
- Lead with what needs attention TODAY, then a short "what happened yesterday" recap.
- Name people by email. Quote concrete numbers from the data.
- If something is fine, say it's fine in one line.

Format the output as plain Markdown (no code fences). Sections:

## Needs attention
- bullet list — only things the recipient should act on

## Yesterday's activity
- 3-6 bullets

## Worth a quick look
- bullets — opportunities, patterns, leads that may go cold

Keep total length under 300 words. Skip a section if nothing worth saying.`;

async function gatherSnapshot(scope: { siteIds: string[] | "all" }) {
  const d = db();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const siteFilter =
    scope.siteIds === "all" ? undefined : sql`site_id in (${sql.join(scope.siteIds.map(id => sql`${id}`), sql`, `)})`;

  const leadsCount = await d
    .select({ siteSlug: sites.slug, count: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(sites, eq(sites.id, leads.siteId))
    .where(
      and(
        gte(leads.createdAt, yesterday),
        scope.siteIds === "all" ? undefined : sql`${leads.siteId} in (${sql.join(scope.siteIds.map(id => sql`${id}`), sql`, `)})`,
      ),
    )
    .groupBy(sites.slug);

  const overdueTasks = await d
    .select({
      title: tasks.title,
      status: tasks.status,
      siteSlug: sites.slug,
      assigneeEmail: sql<string | null>`(select email from users where users.id = tasks.assignee_id)`,
      hoursOverdue: sql<number>`floor(extract(epoch from (now() - tasks.due_at)) / 3600)::int`,
    })
    .from(tasks)
    .innerJoin(sites, eq(sites.id, tasks.siteId))
    .where(
      and(
        sql`${tasks.status} not in ('done','cancelled')`,
        sql`${tasks.dueAt} < now()`,
        scope.siteIds === "all" ? undefined : sql`${tasks.siteId} in (${sql.join(scope.siteIds.map(id => sql`${id}`), sql`, `)})`,
      ),
    )
    .orderBy(desc(sql`extract(epoch from (now() - tasks.due_at))`))
    .limit(15);

  const recentAudits = await d
    .select({
      verdict: taskAudits.verdict,
      summary: taskAudits.summary,
      taskTitle: tasks.title,
      siteSlug: sites.slug,
    })
    .from(taskAudits)
    .innerJoin(tasks, eq(tasks.id, taskAudits.taskId))
    .innerJoin(sites, eq(sites.id, tasks.siteId))
    .where(
      and(
        gte(taskAudits.runAt, yesterday),
        scope.siteIds === "all" ? undefined : sql`${tasks.siteId} in (${sql.join(scope.siteIds.map(id => sql`${id}`), sql`, `)})`,
      ),
    )
    .orderBy(desc(taskAudits.runAt))
    .limit(20);

  const allUsers = await d.select({ email: users.email, role: users.role, lastLoginAt: users.lastLoginAt }).from(users);
  const presentToday = allUsers.filter((u) => u.lastLoginAt && u.lastLoginAt >= todayStart);
  const absentToday = allUsers.filter((u) => !u.lastLoginAt || u.lastLoginAt < todayStart);

  return {
    date: todayStart.toISOString().slice(0, 10),
    new_leads_yesterday: leadsCount,
    open_overdue_tasks: overdueTasks,
    audit_verdicts_yesterday: recentAudits,
    team_presence: {
      present_today: presentToday.map((u) => ({ email: u.email, role: u.role })),
      absent_today: absentToday.map((u) => ({
        email: u.email,
        role: u.role,
        last_login: u.lastLoginAt?.toISOString() ?? null,
      })),
    },
  };
}

async function writeDigestFor(
  client: Anthropic,
  model: string,
  recipient: { id: string; email: string; role: string },
  scope: { siteIds: string[] | "all" },
) {
  const d = db();
  const snapshot = await gatherSnapshot(scope);

  const sysPrompt = DIGEST_PROMPT + `\n\nRecipient: ${recipient.email} (role: ${recipient.role}).`;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [{ type: "text", text: sysPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(snapshot) }],
  });

  const textBlock = response.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  const body = textBlock?.text?.trim() ?? "(empty digest)";

  await d.insert(notifications).values({
    recipientId: recipient.id,
    kind: "daily_digest",
    title: `Daily digest · ${snapshot.date}`,
    body,
    link: "/admin",
  });

  // Also email the digest if the recipient opted in + SMTP is configured.
  await emailIfOptedIn(recipient.id, "daily_digest", {
    kind: "daily_digest",
    markdown: body,
    date: snapshot.date,
  });

  console.log(`[digest] ${recipient.email} — ${body.length} chars, ${response.usage.input_tokens}+${response.usage.output_tokens} tokens`);
}

async function main() {
  await ensureSchema();
  const flags = await getAuditAndDigestFlags();
  if (!flags.configured) throw new LLMNotConfiguredError();
  if (!flags.digestEnabled) {
    console.log("[digest] digest_enabled is false — exiting");
    process.exit(0);
  }

  // Standard tier — daily digest summarization. Sonnet writes
  // human-readable digests well; Opus would be 5× spend with no value
  // gain on this task shape.
  const { client, model } = await getLLMClient({ tier: "standard" });
  const d = db();

  // Admin gets the full network view
  const admins = await d
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.role, "admin"));
  for (const a of admins) {
    try {
      await writeDigestFor(client, model, a, { siteIds: "all" });
    } catch (err) {
      console.error(`[digest] failed for ${a.email}:`, err instanceof Error ? err.message : err);
    }
  }

  // Each manager gets a scoped view of their assigned sites
  const managers = await d
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.role, "manager"));
  for (const m of managers) {
    const assignments = await d.execute<{ site_id: string }>(
      sql`select site_id from site_users where user_id = ${m.id}`,
    );
    const rows = (Array.isArray(assignments) ? assignments : (assignments as { rows: unknown[] }).rows) as { site_id: string }[];
    const siteIds = rows.map((r) => r.site_id);
    if (!siteIds.length) {
      console.log(`[digest] skip manager ${m.email} — no assigned sites`);
      continue;
    }
    try {
      await writeDigestFor(client, model, m, { siteIds });
    } catch (err) {
      console.error(`[digest] failed for ${m.email}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log("[digest] done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
