/**
 * AI audit agent. For each task that's in_progress, in_review, or due in the
 * last 24h, fetches related signals (site homepage snapshot, recent comments,
 * recent leads on the site) and asks Claude to classify completion.
 *
 * Writes one task_audits row per task + posts the verdict as a task comment.
 *
 * Usage:
 *   npm run ai:audit                 # all eligible tasks
 *   npm run ai:audit -- <task-id>    # one task only
 *
 * Run via systemd timer or cron (daily):
 *   30 3 * * *   cd /home/gyl/gyl-platform && /usr/bin/node --env-file=.env.production --import tsx src/scripts/audit.ts >> /var/log/gyl-audit.log 2>&1
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, ensureSchema } from "../db/client";
import {
  leads,
  sites,
  taskAudits,
  taskComments,
  tasks,
  users,
} from "../db/schema";
import { getAuditAndDigestFlags, getLLMClient, LLMNotConfiguredError } from "../lib/llm";

const VERDICT_PROMPT = `You are the GYL Platform task audit agent. You're given one task and the available signals about whether it was completed. Output a JSON object with:

- verdict: one of "done" | "partial" | "not_started" | "no_show" | "ambiguous"
- summary: 1-3 sentence explanation in plain English, addressed to the team manager
- reasoning: 1-2 sentences on what evidence drove the verdict

Verdict definitions:
- "done": clear evidence the task was completed (e.g. the page now exists, the photo was replaced, the lead got a follow-up comment).
- "partial": meaningful progress but not finished (e.g. draft started, 2 of 5 items done).
- "not_started": the task is still in "todo" or no evidence of any work; assignee did log in.
- "no_show": assignee has NOT logged in within the task's window AND no work is visible. Reserve this for clear absence.
- "ambiguous": signals are insufficient to judge. Prefer this over guessing.

Be conservative — when in doubt, choose "ambiguous". Reply with ONLY the JSON object, no prose.`;

const VerdictSchema = z.object({
  verdict: z.enum(["done", "partial", "not_started", "no_show", "ambiguous"]),
  summary: z.string().min(1).max(2000),
  reasoning: z.string().min(1).max(1000),
});

async function fetchSiteSnippet(domain: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`https://${domain}/`, {
      signal: controller.signal,
      headers: { "User-Agent": "gyl-audit/0.1 (+platform)" },
    });
    clearTimeout(timeout);
    if (!resp.ok) return `site fetch failed: ${resp.status}`;
    const html = await resp.text();
    // Crude text extraction — strip tags, collapse whitespace, cap at 4KB
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 4000);
  } catch (err) {
    return `site fetch error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listEligibleTasks(singleId: string | null): Promise<string[]> {
  const d = db();
  if (singleId) return [singleId];
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await d
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        // skip already done/cancelled
        sql`${tasks.status} not in ('done','cancelled')`,
        // either due in the last 24h OR is currently in-progress / in-review / blocked
        sql`(${tasks.status} in ('in_progress','in_review','blocked') OR (${tasks.dueAt} is not null and ${tasks.dueAt} >= ${last24h.toISOString()}::timestamptz - interval '7 days' and ${tasks.dueAt} <= now() + interval '12 hours'))`,
      ),
    )
    .orderBy(desc(tasks.dueAt));
  return rows.map((r) => r.id);
}

async function auditOne(client: Anthropic, model: string, taskId: string): Promise<void> {
  const d = db();
  const [t] = await d
    .select({
      task: tasks,
      siteSlug: sites.slug,
      siteDomain: sites.domain,
      siteCity: sites.city,
      assigneeEmail: sql<string | null>`(select email from users where users.id = tasks.assignee_id)`,
      assigneeLastLogin: sql<Date | null>`(select last_login_at from users where users.id = tasks.assignee_id)`,
    })
    .from(tasks)
    .innerJoin(sites, eq(sites.id, tasks.siteId))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t) {
    console.warn(`[audit] task ${taskId} not found — skipping`);
    return;
  }

  // Gather signals
  const recentComments = await d
    .select({ body: taskComments.body, createdAt: taskComments.createdAt })
    .from(taskComments)
    .where(eq(taskComments.taskId, taskId))
    .orderBy(desc(taskComments.createdAt))
    .limit(8);

  const recentLeads = await d
    .select({ form: leads.form, name: leads.name, createdAt: leads.createdAt, status: leads.status })
    .from(leads)
    .where(and(eq(leads.siteId, t.task.siteId), gte(leads.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))))
    .orderBy(desc(leads.createdAt))
    .limit(10);

  const siteText = await fetchSiteSnippet(t.siteDomain);

  const signals = {
    task: {
      title: t.task.title,
      description: t.task.description,
      status: t.task.status,
      priority: t.task.priority,
      due_at: t.task.dueAt?.toISOString() ?? null,
      created_at: t.task.createdAt.toISOString(),
      updated_at: t.task.updatedAt.toISOString(),
    },
    site: {
      slug: t.siteSlug,
      domain: t.siteDomain,
      city: t.siteCity,
      homepage_text_excerpt: siteText,
    },
    assignee: {
      email: t.assigneeEmail,
      last_login_at: t.assigneeLastLogin?.toISOString() ?? null,
      logged_in_today:
        !!t.assigneeLastLogin &&
        t.assigneeLastLogin >= new Date(new Date().setHours(0, 0, 0, 0)),
    },
    recent_comments: recentComments.map((c) => ({
      at: c.createdAt.toISOString(),
      body: c.body.slice(0, 500),
    })),
    leads_on_this_site_last_7d: recentLeads.length,
    sample_leads: recentLeads.slice(0, 3),
  };

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: [{ type: "text", text: VERDICT_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(signals) }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = textBlock?.text?.trim() ?? "{}";
  // Strip ```json fences if the model wrapped them
  const cleaned = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let parsed: z.infer<typeof VerdictSchema>;
  try {
    parsed = VerdictSchema.parse(JSON.parse(cleaned));
  } catch (err) {
    console.warn(`[audit] ${taskId}: model returned bad JSON, raw=${raw.slice(0, 200)}`);
    return;
  }

  const tokensUsed = String(response.usage.input_tokens + response.usage.output_tokens);

  await d.insert(taskAudits).values({
    taskId,
    verdict: parsed.verdict,
    summary: parsed.summary,
    evidence: { reasoning: parsed.reasoning, signals_used: Object.keys(signals) },
    tokensUsed,
  });

  // Drop a visible comment so the manager sees it in the task UI
  await d.insert(taskComments).values({
    taskId,
    authorId: null, // AI authored
    body: `🤖 audit verdict: **${parsed.verdict}**\n\n${parsed.summary}\n\n_reasoning: ${parsed.reasoning}_`,
  });

  console.log(`[audit] ${t.siteSlug}/${t.task.title.slice(0, 40)} → ${parsed.verdict}`);
}

async function main() {
  await ensureSchema();
  const singleId = process.argv[2] ?? null;
  const flags = await getAuditAndDigestFlags();
  if (!flags.configured) throw new LLMNotConfiguredError();
  if (!flags.auditEnabled && !singleId) {
    console.log("[audit] audit_enabled is false in settings — exiting (use single-task mode to force)");
    process.exit(0);
  }

  // Standard tier — task progress classification (done/partial/no-show).
  // Judgment task with short structured output; Sonnet handles it well.
  const { client, model } = await getLLMClient({ tier: "standard" });
  const taskIds = await listEligibleTasks(singleId);
  console.log(`[audit] auditing ${taskIds.length} task(s) using ${model}`);
  for (const id of taskIds) {
    try {
      await auditOne(client, model, id);
    } catch (err) {
      console.error(`[audit] ${id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log("[audit] done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// quiet unused imports kept for future filters
void isNotNull;
void lte;
