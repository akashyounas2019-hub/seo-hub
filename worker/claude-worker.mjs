#!/usr/bin/env node
/**
 * SEO Hub — Claude Code worker.
 *
 * Runs locally on the operator's machine. Polls the portal for queued claude_jobs,
 * dispatches each job's prompt to the local `claude` CLI, captures output,
 * and posts results back.
 */
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir, hostname, userInfo } from "node:os";
import { join } from "node:path";

const PORTAL = process.env.GYL_PORTAL_URL || "http://localhost:3030";
const SECRET = process.env.GYL_WORKER_SECRET || "default_secret";
const POLL_INTERVAL_MS = Number(process.env.GYL_POLL_INTERVAL_MS ?? 30_000);
const WORKER_ID = process.env.GYL_WORKER_ID ?? `${userInfo().username}@${hostname()}`;
const CLAUDE_BIN = process.env.GYL_CLAUDE_BIN ?? "claude";
const MAX_TURNS = Number(process.env.GYL_CLAUDE_MAX_TURNS ?? 25);
const TIMEOUT_MS = Number(process.env.GYL_CLAUDE_TIMEOUT_MS ?? 20 * 60_000);
const MODEL = process.env.GYL_CLAUDE_MODEL ?? "claude-opus-4-7";
const EFFORT = process.env.GYL_CLAUDE_EFFORT ?? "max";

const HEADERS = {
  "content-type": "application/json",
  authorization: `Bearer ${SECRET}`,
};

async function api(path, init = {}) {
  const res = await fetch(`${PORTAL}${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function runClaude(prompt) {
  const dir = await mkdtemp(join(tmpdir(), "seo-hub-claude-"));
  const promptFile = join(dir, "prompt.txt");
  await writeFile(promptFile, prompt, "utf8");
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const args = [
      "--print",
      "--max-turns", String(MAX_TURNS),
      "--output-format", "text",
      "--model", MODEL,
      "--effort", EFFORT,
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
  let res;
  try {
    res = await api(`/api/jobs/claim`, {
      method: "POST",
      body: JSON.stringify({
        workerId: WORKER_ID,
        workerKind: "mac",
        workerInfo: { node: process.version, host: hostname(), kind: "mac-claude-code" },
      }),
    });
  } catch (err) {
    return null;
  }
  return res.job ?? null;
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

async function workOne(job) {
  console.log(`[worker] claimed ${job.id} — ${job.title} (${job.kind})`);
  const hb = setInterval(() => heartbeat(job.id), 60_000);
  await heartbeat(job.id);
  try {
    const { output, durationMs } = await runClaude(job.prompt || job.title);
    await complete(job.id, output, durationMs);
    console.log(`[worker] done ${job.id} in ${Math.round(durationMs / 1000)}s`);
  } catch (err) {
    console.error(`[worker] ${job.id} failed:`, err.message);
    await fail(job.id, err.message);
  } finally {
    clearInterval(hb);
  }
}

async function main() {
  console.log(`[worker] starting · workerId=${WORKER_ID} · portal=${PORTAL}`);
  console.log(`[worker] polling every ${POLL_INTERVAL_MS / 1000}s`);
  while (true) {
    try {
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
