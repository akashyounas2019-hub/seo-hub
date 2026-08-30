#!/usr/bin/env node
/**
 * AKS SEO Console — background worker.
 *
 * Runs on the operator's machine (or anywhere with an authenticated `claude`
 * CLI). Polls this app's own /api/jobs/* routes for queued `claude_jobs`,
 * dispatches each job's prompt to the local `claude` CLI, captures output,
 * and posts results back.
 *
 * For jobs of kind "knowledge:structure-from-crawl", the worker also parses
 * the CLI's JSON output and PATCHes it straight into the site's
 * structuredKb column, so the Knowledge Base updates the moment the job
 * finishes — no separate "apply result" step needed.
 */
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir, hostname, userInfo } from "node:os";
import { join } from "node:path";
import { runQaSuite } from "./qa-engine.mjs";
import { scrapeSocialLinks } from "./social-scraper.mjs";

const PORTAL = process.env.AKS_WORKER_PORTAL_URL || "http://localhost:3333";
const POLL_INTERVAL_MS = Number(process.env.AKS_WORKER_POLL_INTERVAL_MS ?? 15_000);
const WORKER_ID = process.env.AKS_WORKER_ID ?? `${userInfo().username}@${hostname()}`;
const CLAUDE_BIN = process.env.AKS_WORKER_CLAUDE_BIN ?? "claude";
const TIMEOUT_MS = Number(process.env.AKS_WORKER_CLAUDE_TIMEOUT_MS ?? 20 * 60_000);
const MODEL = process.env.AKS_WORKER_CLAUDE_MODEL ?? "sonnet";
// How often the worker checks whether any site is due for its real 24h
// "Head of SEO" orchestrator review -- checking this every 15s poll cycle
// would be pointless DB load since the due-check granularity is 24h itself;
// once an hour is plenty responsive without hammering Postgres.
const ORCHESTRATOR_CHECK_INTERVAL_MS = Number(process.env.AKS_WORKER_ORCHESTRATOR_CHECK_INTERVAL_MS ?? 60 * 60_000);
// Same reasoning, for the daily technical diagnostics agent (PageSpeed
// Insights + robots.txt/sitemap/HTTPS checks -> Issues tab + Alert Manager).
const DIAGNOSTICS_CHECK_INTERVAL_MS = Number(process.env.AKS_WORKER_DIAGNOSTICS_CHECK_INTERVAL_MS ?? 60 * 60_000);

async function api(path, init = {}) {
  const res = await fetch(`${PORTAL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function runClaude(prompt) {
  const dir = await mkdtemp(join(tmpdir(), "aks-worker-claude-"));
  const promptFile = join(dir, "prompt.txt");
  await writeFile(promptFile, prompt, "utf8");
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const args = [
      "--print",
      "--output-format", "text",
      "--model", MODEL,
      "--permission-mode", "bypassPermissions",
    ];
    const child = spawn(CLAUDE_BIN, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(killer);
      rm(dir, { recursive: true, force: true }).catch(() => {});
      reject(err);
    });
    child.on("close", async (code) => {
      clearTimeout(killer);
      const ms = Date.now() - started;
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve({ output: stdout.trim(), durationMs: ms });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function claimOnce() {
  try {
    const res = await api(`/api/jobs/claim`, {
      method: "POST",
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    return res.job ?? null;
  } catch {
    return null;
  }
}

async function heartbeat(jobId) {
  try {
    await api(`/api/jobs/${jobId}/heartbeat`, { method: "POST", body: "{}" });
  } catch (err) {
    console.warn(`[worker] heartbeat ${jobId} failed:`, err.message);
  }
}

async function complete(jobId, output, durationMs) {
  await api(`/api/jobs/${jobId}/complete`, {
    method: "POST",
    body: JSON.stringify({ outputMarkdown: output, durationMs }),
  });
}

async function fail(jobId, error) {
  try {
    await api(`/api/jobs/${jobId}/fail`, {
      method: "POST",
      body: JSON.stringify({ error: String(error).slice(0, 1000) }),
    });
  } catch (err) {
    console.warn(`[worker] fail ${jobId} could not be reported:`, err.message);
  }
}

/**
 * Extracts a JSON object from Claude's output even if it wrapped the JSON
 * in markdown fences or added stray prose around it.
 */
function extractJson(output) {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : output;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    // last resort: find the first { ... last }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function applyKnowledgeBaseResult(job, output) {
  const siteId = job.input?.siteId;
  if (!siteId) {
    console.warn(`[worker] job ${job.id} has no siteId — skipping structuredKb save`);
    return;
  }
  const parsed = extractJson(output);
  if (!parsed) {
    console.warn(`[worker] job ${job.id} output did not parse as JSON — structuredKb not saved`);
    return;
  }
  try {
    await api(`/api/sites/${siteId}`, {
      method: "PATCH",
      body: JSON.stringify({ structuredKb: parsed }),
    });
    console.log(`[worker] job ${job.id} — structuredKb saved to site ${siteId}`);
  } catch (err) {
    console.error(`[worker] job ${job.id} — failed to save structuredKb:`, err.message);
  }
}

/**
 * QA runs don't go through the claude CLI at all -- they drive Playwright
 * directly (qa-engine.mjs). The claude_jobs row still exists so this kind
 * shares the same claim/heartbeat/complete lifecycle as every other job,
 * but the real result (findings) is posted to the qa_runs-specific
 * endpoints, since a Markdown blob isn't the right shape for structured
 * pass/fail findings.
 */
async function workQaJob(job) {
  const input = job.input || {};
  const runId = input.runId;
  if (!runId) throw new Error("qa:run job is missing input.runId");

  await api(`/api/qa/runs/${runId}/status`, { method: "POST", body: JSON.stringify({ status: "running" }) });

  const started = Date.now();
  try {
    const { findings, pagesChecked } = await runQaSuite({
      baseUrl: input.baseUrl,
      scope: input.scope || "full",
      targetUrl: input.targetUrl,
    });
    const durationMs = Date.now() - started;

    await api(`/api/qa/runs/${runId}/complete`, {
      method: "POST",
      body: JSON.stringify({ findings, pagesChecked, durationMs }),
    });

    const failed = findings.filter((f) => !f.passed).length;
    return { output: `QA run complete — ${pagesChecked} page(s) checked, ${findings.length} check(s), ${failed} failing.`, durationMs };
  } catch (err) {
    await api(`/api/qa/runs/${runId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: "failed", error: err.message }),
    }).catch(() => {});
    throw err;
  }
}

/**
 * Social profile scraping doesn't go through the claude CLI either -- it's
 * a real Playwright navigation + link extraction, no LLM involved. Result
 * is PATCHed straight into the site's structuredKb.socialLinks, merged with
 * whatever the site already had rather than overwriting fields this scrape
 * didn't find.
 */
async function workSocialScrapeJob(job) {
  const input = job.input || {};
  const { siteId, targetUrl } = input;
  if (!siteId || !targetUrl) throw new Error("social:scrape job is missing input.siteId or input.targetUrl");

  const started = Date.now();
  const { socialLinks, scrapedFrom } = await scrapeSocialLinks(targetUrl);
  const durationMs = Date.now() - started;

  const siteRes = await api(`/api/sites/${siteId}`);
  const existingKb = siteRes?.site?.structuredKb || {};
  const mergedSocial = {
    ...(existingKb.socialLinks || {}),
    ...socialLinks,
    scrapedFrom,
    scrapedAt: new Date().toISOString(),
  };

  await api(`/api/sites/${siteId}`, {
    method: "PATCH",
    body: JSON.stringify({ structuredKb: { ...existingKb, socialLinks: mergedSocial } }),
  });

  const found = Object.keys(socialLinks).filter((k) => k !== "scrapedFrom" && k !== "scrapedAt");
  return {
    output: found.length
      ? `Found ${found.length} social profile(s): ${found.join(", ")}`
      : "No social profile links found on this page.",
    durationMs,
  };
}

async function workOne(job) {
  console.log(`[worker] claimed ${job.id} — ${job.title} (${job.kind})`);
  const hb = setInterval(() => heartbeat(job.id), 60_000);
  await heartbeat(job.id);
  try {
    let output, durationMs;

    if (job.kind === "qa:run") {
      ({ output, durationMs } = await workQaJob(job));
    } else if (job.kind === "social:scrape") {
      ({ output, durationMs } = await workSocialScrapeJob(job));
    } else {
      ({ output, durationMs } = await runClaude(job.prompt || job.title));

      if (job.kind === "knowledge:structure-from-crawl") {
        await applyKnowledgeBaseResult(job, output);
      }
    }

    await complete(job.id, output, durationMs);
    console.log(`[worker] done ${job.id} in ${Math.round(durationMs / 1000)}s`);
  } catch (err) {
    console.error(`[worker] ${job.id} failed:`, err.message);
    await fail(job.id, err.message);
  } finally {
    clearInterval(hb);
  }
}

/**
 * Real 24h auto-trigger for the Head of SEO orchestrator -- no separate
 * scheduler/cron process; this worker is already running 24/7 under pm2,
 * so it's the natural place for a time-based check. Calls the exact same
 * /api/orchestrator/run endpoint the manual "Run SEO Review" button hits,
 * so there is exactly one orchestrator code path, not a duplicated one.
 */
async function checkAndRunDueOrchestratorReviews() {
  try {
    const { due } = await api(`/api/orchestrator/due-sites`);
    for (const site of due || []) {
      try {
        console.log(`[worker] auto-triggering Head of SEO review for ${site.siteName} (last run: ${site.lastRunAt || "never"})`);
        await api(`/api/orchestrator/run`, {
          method: "POST",
          body: JSON.stringify({ siteId: site.siteId }),
        });
      } catch (err) {
        console.warn(`[worker] auto-orchestrator trigger failed for ${site.siteId}:`, err.message);
      }
    }
  } catch (err) {
    console.warn("[worker] due-sites check failed:", err.message);
  }
}

/**
 * Real 24h auto-trigger for the daily technical diagnostics agent -- same
 * shape as checkAndRunDueOrchestratorReviews above, calling the exact same
 * /api/site-diagnostics/run endpoint a manual re-check would hit (via
 * runAndStoreDiagnostics inside api.sites.$id.issues.ts), so there's one
 * real diagnostics code path either way.
 */
async function checkAndRunDueDiagnostics() {
  try {
    const { due } = await api(`/api/site-diagnostics/due-sites`);
    for (const site of due || []) {
      try {
        console.log(`[worker] auto-triggering daily diagnostics for ${site.siteName} (last checked: ${site.lastCheckedAt || "never"})`);
        await api(`/api/site-diagnostics/run`, {
          method: "POST",
          body: JSON.stringify({ siteId: site.siteId }),
        });
      } catch (err) {
        console.warn(`[worker] auto-diagnostics trigger failed for ${site.siteId}:`, err.message);
      }
    }
  } catch (err) {
    console.warn("[worker] diagnostics due-sites check failed:", err.message);
  }
}

async function main() {
  console.log(`[worker] starting · workerId=${WORKER_ID} · portal=${PORTAL} · model=${MODEL}`);
  console.log(`[worker] polling every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`[worker] checking for due Head of SEO reviews every ${ORCHESTRATOR_CHECK_INTERVAL_MS / 60_000}min`);
  console.log(`[worker] checking for due daily diagnostics every ${DIAGNOSTICS_CHECK_INTERVAL_MS / 60_000}min`);

  let lastOrchestratorCheck = 0;
  let lastDiagnosticsCheck = 0;

  while (true) {
    try {
      if (Date.now() - lastOrchestratorCheck >= ORCHESTRATOR_CHECK_INTERVAL_MS) {
        lastOrchestratorCheck = Date.now();
        await checkAndRunDueOrchestratorReviews();
      }

      if (Date.now() - lastDiagnosticsCheck >= DIAGNOSTICS_CHECK_INTERVAL_MS) {
        lastDiagnosticsCheck = Date.now();
        await checkAndRunDueDiagnostics();
      }

      const job = await claimOnce();
      if (job) {
        await workOne(job);
        continue;
      }
    } catch (err) {
      console.warn("[worker] loop error:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
