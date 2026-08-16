/**
 * Server-side Claude executor — runs claude_jobs autonomously using the
 * platform's Anthropic API key. No Mac worker required.
 *
 * Design choices:
 *   - Drives the SAME templates as the Mac-worker path
 *   - Uses Anthropic's server-side `web_search` tool so audits + research
 *     templates can actually browse the live web
 *   - LIMO_PREFACE goes in `system` with `cache_control: ephemeral` →
 *     ~3-4× cost reduction across a day of jobs
 *   - Atomically claims one pending job per tick so it never double-runs
 *   - Worker token usage logged to ai_usage table (existing dashboard)
 *
 * The instrumentation hook (src/instrumentation.ts) calls `runOneJob()`
 * every 60s. If a Mac worker is also running, both race for jobs — the
 * UPDATE WHERE status='pending' is atomic so only one wins.
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { aiUsage, claudeJobs, sites } from "../db/schema";
import { templateByKind } from "./claude-job-templates";
import { getLLMClient, LLMNotConfiguredError } from "./llm";

const WORKER_ID = "server:gyl-platform";
const MAX_TURNS = 10;          // tool-use loop cap
const MAX_TOKENS_OUT = 8192;
const TIMEOUT_MS = 15 * 60_000; // 15 min hard cap per job

/**
 * Direct (non-LLM) job handlers — server-side actions instead of an LLM prompt.
 * Empty today: design-research capture is intentionally NOT here — it runs ONLY
 * on the Mac worker (Playwright + $0 Claude Code vision). See MAC_ONLY_KINDS.
 */
const DIRECT_HANDLERS: Record<string, (input: Record<string, unknown>) => Promise<string>> = {};

/**
 * Kinds the server executor must NEVER claim — they require the Mac worker's
 * Claude Code (e.g. $0 vision segmentation on screenshots) and would be
 * mis-run as a plain LLM prompt here. The Mac worker owns these end-to-end.
 */
const MAC_ONLY_KINDS = ["research:capture_sections", "audit:section_watch"];

/**
 * Atomically claim the highest-priority pending job. Returns null if the
 * queue is empty or no API key is configured.
 */
async function claimNextJob() {
  // Auto-reclaim jobs stuck in 'claimed' or 'running' with no heartbeat
  // for >10 min (Mac worker died, or our last execution crashed).
  const stale = new Date(Date.now() - 10 * 60_000);
  await db()
    .update(claudeJobs)
    .set({ status: "pending", workerId: null, claimedAt: null })
    .where(
      and(
        sql`${claudeJobs.status} in ('claimed','running')`,
        sql`${claudeJobs.claimedAt} < ${stale.toISOString()}::timestamptz`,
      ),
    );

  // ROUTING: we are the SERVER executor (API key — costs money). Skip
  // jobs that prefer the Mac Claude Code worker UNLESS they've sat for
  // 5+ minutes unclaimed (stale fallback so jobs don't stall when Mac
  // worker is offline). Always pick up prefer_worker='server' and 'any'.
  const macStaleCutoff = new Date(Date.now() - 5 * 60_000);
  const [next] = await db()
    .select({ id: claudeJobs.id })
    .from(claudeJobs)
    .where(
      and(
        eq(claudeJobs.status, "pending"),
        // Never claim Mac-only kinds (they need Claude Code, e.g. $0 vision).
        notInArray(claudeJobs.kind, MAC_ONLY_KINDS),
        sql`(
          ${claudeJobs.preferWorker} IN ('server', 'any')
          OR (
            ${claudeJobs.preferWorker} = 'mac'
            AND ${claudeJobs.createdAt} < ${macStaleCutoff.toISOString()}::timestamptz
          )
        )`,
      ),
    )
    .orderBy(
      sql`case ${claudeJobs.priority} when 'high' then 0 when 'normal' then 1 else 2 end`,
      asc(claudeJobs.createdAt),
    )
    .limit(1);
  if (!next) return null;

  const [claimed] = await db()
    .update(claudeJobs)
    .set({
      status: "running",
      workerId: WORKER_ID,
      workerInfo: { kind: "server-executor", node: process.version },
      claimedAt: new Date(),
      startedAt: new Date(),
    })
    .where(and(eq(claudeJobs.id, next.id), eq(claudeJobs.status, "pending")))
    .returning();
  return claimed ?? null;
}

async function resolveSiteContext(siteId: string | null) {
  if (!siteId) return null;
  const [s] = await db().select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    domain: s.domain,
    city: s.city,
    region: s.region,
    url: `https://${s.domain}`,
  };
}

/* ────────────────────────────────────────────────────────────────────
 * Run loop — single tool-use turn cycle
 * ────────────────────────────────────────────────────────────────────
 *
 * The web_search + web_fetch tools are server-side (executed by
 * Anthropic). We just declare them, then read out the assistant's
 * final text once the model stops requesting tools.
 */
async function executeWithWebTools(
  client: Anthropic,
  model: string,
  prompt: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number; toolCalls: number }> {
  let tokensIn = 0;
  let tokensOut = 0;
  let toolCalls = 0;

  // Conversation buffer — we keep appending assistant + tool-use rounds.
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS_OUT,
      tools: [
        // Server-side web search — Anthropic runs the query + injects results.
        // The tool block type version stamp must match a release Anthropic has
        // shipped; update if the API surface ships a newer revision.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { type: "web_search_20250305", name: "web_search", max_uses: 12 } as any,
      ],
      messages,
    });

    tokensIn  += response.usage?.input_tokens ?? 0;
    tokensOut += response.usage?.output_tokens ?? 0;

    // Append the assistant's response to the buffer (so a follow-up
    // request can include its tool_use IDs).
    messages.push({ role: "assistant", content: response.content });

    // If the model is done, capture the final text and exit.
    if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");
      return { text, tokensIn, tokensOut, toolCalls };
    }

    // tool_use stop reason: server-side tools execute on Anthropic's side,
    // so we don't need to do anything except continue the loop — the next
    // request will include the tool results automatically when we re-send
    // the conversation. (Anthropic appends server_tool_use + web_search_tool_result
    // blocks for us; nothing to inject from our side.)
    if (response.stop_reason === "tool_use") {
      toolCalls += response.content.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (b: any) => b.type === "server_tool_use" || b.type === "tool_use",
      ).length;
      continue;
    }

    // Pause/other stop reasons — bail.
    break;
  }

  // We exhausted turns or hit an unexpected stop. Salvage what text we have.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const text =
    lastAssistant && Array.isArray(lastAssistant.content)
      ? lastAssistant.content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((b: any) => b.type === "text")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((b: any) => b.text)
          .join("\n\n")
      : "(no text response captured)";
  return { text, tokensIn, tokensOut, toolCalls };
}

async function markFailed(jobId: string, message: string) {
  await db()
    .update(claudeJobs)
    .set({ status: "failed", error: message.slice(0, 1000), finishedAt: new Date() })
    .where(eq(claudeJobs.id, jobId));
}

async function markDone(jobId: string, text: string, durationMs: number, tokensIn: number, tokensOut: number) {
  await db()
    .update(claudeJobs)
    .set({
      status: "done",
      outputMarkdown: text,
      tokensInput: tokensIn,
      tokensOutput: tokensOut,
      durationMs,
      finishedAt: new Date(),
    })
    .where(eq(claudeJobs.id, jobId));

  // Build-workspace jobs route their output to the right table. Safe to
  // call for any kind — non-build jobs are no-ops.
  try {
    const { postProcessJob } = await import("./build-job-postprocess");
    await postProcessJob(jobId);
  } catch (err) {
    console.warn("[claude-executor] post-process failed:", err instanceof Error ? err.message : err);
  }
}

async function logUsage(
  jobId: string,
  siteId: string | null,
  model: string,
  tokensIn: number,
  tokensOut: number,
  durationMs: number,
) {
  // Reuse the existing ai_usage table — same dashboards already display it.
  // Cost is denormalized via ai-pricing helper if it's wired; otherwise 0.
  try {
    let costMicroUsd = 0;
    try {
      const pricing = await import("./ai-pricing");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (pricing as any).estimateCostMicroUsd === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        costMicroUsd = (pricing as any).estimateCostMicroUsd({ model, input: tokensIn, output: tokensOut }) ?? 0;
      }
    } catch {
      // best-effort
    }
    await db().insert(aiUsage).values({
      agent: "claude_job",
      parentType: "claude_job",
      parentId: jobId,
      siteId,
      model,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costMicroUsd,
      durationMs,
    });
  } catch (err) {
    console.warn("[claude-executor] usage log failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Process exactly one pending job. Returns:
 *  - `'idle'`  → no pending job
 *  - `'no-key'` → no Anthropic key configured (silently skip until user sets one)
 *  - `'ok'`    → ran one job (regardless of success/failure)
 *  - `'error'` → unexpected failure in the executor itself (not the job)
 */
export async function runOneJob(): Promise<"idle" | "no-key" | "ok" | "error"> {
  const job = await claimNextJob();
  if (!job) return "idle";

  // Direct (non-LLM) handlers run a server-side ACTION instead of an LLM
  // prompt — e.g. design-research capture POSTs to the Playwright route. These
  // need NO Anthropic key AT THE EXECUTOR, so run them BEFORE the LLM gate
  // (previously the executor bailed with "no-key" before it ever claimed,
  // which silently stalled the whole design-research pipeline). Mirrors the
  // Mac worker's DIRECT_HANDLERS so these jobs no longer require the Mac.
  const direct = DIRECT_HANDLERS[job.kind];
  if (direct) {
    const t0 = Date.now();
    try {
      const text = await direct((job.input ?? {}) as Record<string, unknown>);
      await markDone(job.id, text, Date.now() - t0, 0, 0);
      console.log(`[claude-executor] ran ${job.id} · kind=${job.kind} (direct handler) in ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (err) {
      await markFailed(job.id, err instanceof Error ? err.message : String(err));
    }
    return "ok";
  }

  // LLM-backed jobs need an Anthropic client. If none is configured, release
  // the job back to pending (so the Mac worker can still take it) instead of
  // failing it, and report no-key.
  let client: Anthropic;
  let model: string;
  try {
    // Heavy tier — deep audits, multi-step research, long-form content
    // drafts, design generation. Resolves to Opus 4.7 by default
    // (overridable via ANTHROPIC_MODEL_HEAVY env or org_settings.llm_model).
    const llm = await getLLMClient({ tier: "heavy" });
    client = llm.client;
    model = llm.model;
  } catch (err) {
    await db().update(claudeJobs)
      .set({ status: "pending", workerId: null, claimedAt: null })
      .where(eq(claudeJobs.id, job.id));
    if (err instanceof LLMNotConfiguredError) return "no-key";
    console.warn("[claude-executor] LLM client error:", err instanceof Error ? err.message : err);
    return "error";
  }

  const started = Date.now();
  const template = templateByKind(job.kind);
  if (!template) {
    await markFailed(job.id, `Unknown template kind: ${job.kind}`);
    return "ok";
  }

  const site = await resolveSiteContext(job.siteId);
  const prompt = template.buildPrompt(
    (job.input ?? {}) as Record<string, string>,
    {
      siteName: site?.name,
      siteUrl: site?.url,
      siteCity: site?.city ?? undefined,
      siteRegion: site?.region ?? undefined,
    },
  );

  console.log(`[claude-executor] running ${job.id} · kind=${job.kind} · model=${model}`);

  try {
    const result = await Promise.race([
      executeWithWebTools(client, model, prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
      ),
    ]);
    const durationMs = Date.now() - started;
    await markDone(job.id, result.text || "(no output)", durationMs, result.tokensIn, result.tokensOut);
    await logUsage(job.id, job.siteId, model, result.tokensIn, result.tokensOut, durationMs);
    console.log(
      `[claude-executor] done ${job.id} in ${Math.round(durationMs / 1000)}s ` +
        `· tokens in/out ${result.tokensIn}/${result.tokensOut} · tool calls ${result.toolCalls}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[claude-executor] FAILED ${job.id}: ${msg}`);
    await markFailed(job.id, msg);
  }
  return "ok";
}

let _looping = false;
let _ticker: NodeJS.Timeout | null = null;

/**
 * Start the polling loop. Called once from instrumentation.ts. Safe to
 * call multiple times — idempotent.
 *
 * Tick cadence is 30s when idle, ~2s after running a job (drain bursts
 * faster). One job at a time per process — keeps Anthropic rate-limit
 * friendly and lets us see real-time progress in the UI.
 */
export function startServerExecutor(opts?: { pollMs?: number }) {
  if (_ticker) return;
  const pollMs = opts?.pollMs ?? 30_000;
  console.log(`[claude-executor] starting · pollMs=${pollMs}`);

  const tick = async () => {
    if (_looping) return;
    _looping = true;
    try {
      const result = await runOneJob();
      // If we ran a job, immediately re-check the queue rather than wait
      // for the next interval — drain bursts quickly.
      if (result === "ok") {
        setTimeout(tick, 2000);
      }
    } catch (err) {
      console.error("[claude-executor] tick error:", err instanceof Error ? err.message : err);
    } finally {
      _looping = false;
    }
  };

  // Initial nudge so the first tick fires soon after boot.
  setTimeout(tick, 5_000);
  _ticker = setInterval(tick, pollMs);
}

export function stopServerExecutor() {
  if (_ticker) {
    clearInterval(_ticker);
    _ticker = null;
  }
}
