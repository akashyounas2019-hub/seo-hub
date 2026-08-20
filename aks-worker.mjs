#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir, hostname, userInfo } from "node:os";
import { join } from "node:path";

// ─── Configuration ───
const PORTAL_URL    = process.env.PORTAL_URL || "http://localhost:3030";
const WORKER_SECRET = process.env.WORKER_SECRET || "aks-secret-key-2026";
const POLL_MS       = Number(process.env.POLL_MS ?? 5000); // 5s poll default
const CLAUDE_BIN    = process.env.CLAUDE_BIN ?? "claude";
const MAX_TURNS     = Number(process.env.MAX_TURNS ?? 25);
const TIMEOUT_MS    = Number(process.env.TIMEOUT_MS ?? 15 * 60000); // 15 min
const MODEL         = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
const WORKER_ID     = `${userInfo().username}@${hostname()}`;

const HEADERS = {
  "content-type": "application/json",
  authorization: `Bearer ${WORKER_SECRET}`,
};

// ─── API helper ───
async function api(path, init = {}) {
  const res = await fetch(`${PORTAL_URL}${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Run Claude Code CLI ───
async function runClaude(promptText) {
  const dir = await mkdtemp(join(tmpdir(), "worker-claude-"));
  const promptFile = join(dir, "prompt.txt");
  await writeFile(promptFile, promptText, "utf8");

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const args = [
      "--print",
      "--max-turns", String(MAX_TURNS),
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
      reject(new Error(`claude CLI timed out after ${TIMEOUT_MS}ms`));
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
        reject(new Error(`claude CLI exited code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve({ output: stdout.trim(), durationMs: ms });
    });

    child.stdin.write(promptText);
    child.stdin.end();
  });
}

// ─── Claim a job ───
async function claimOnce() {
  try {
    const res = await api("/api/jobs/claim", {
      method: "POST",
      body: JSON.stringify({
        workerId: WORKER_ID,
        workerKind: "mac",
      }),
    });
    return res.job ?? null;
  } catch (err) {
    console.warn("[aks-worker] claim poll warning:", err.message);
    return null;
  }
}

// ─── Heartbeat ───
async function heartbeat(jobId) {
  try {
    await api(`/api/jobs/${jobId}/heartbeat`, { method: "POST", body: "{}" });
  } catch (err) {
    console.warn(`[aks-worker] heartbeat failed:`, err.message);
  }
}

// ─── Complete ───
async function complete(jobId, output, durationMs) {
  await api(`/api/jobs/${jobId}/complete`, {
    method: "POST",
    body: JSON.stringify({ outputMarkdown: output, durationMs }),
  });
}

// ─── Fail ───
async function fail(jobId, error) {
  try {
    await api(`/api/jobs/${jobId}/fail`, {
      method: "POST",
      body: JSON.stringify({ error: String(error).slice(0, 1000) }),
    });
  } catch (err) {
    console.warn(`[aks-worker] fail report failed:`, err.message);
  }
}

// ─── Process one job ───
async function workOne(job) {
  console.log(`\n🚀 [aks-worker] CLAIMED JOB: [${job.id}] — ${job.title} (${job.kind})`);
  const hb = setInterval(() => heartbeat(job.id), 30000);
  await heartbeat(job.id);

  try {
    console.log(`⏳ [aks-worker] Running prompt through Claude Code CLI (${MODEL})...`);
    const { output, durationMs } = await runClaude(job.prompt);
    await complete(job.id, output, durationMs);
    console.log(`✅ [aks-worker] SUCCESS [${job.id}] finished in ${Math.round(durationMs / 1000)}s!`);
  } catch (err) {
    console.error(`❌ [aks-worker] FAILED [${job.id}]:`, err.message);
    await fail(job.id, err.message);
  } finally {
    clearInterval(hb);
  }
}

// ─── Main loop ───
async function main() {
  console.log(`================================================================`);
  console.log(`🤖 AKS WORKER — CLOUD SUBSCRIPTION AI RUNNER`);
  console.log(`================================================================`);
  console.log(`• Operator Machine : ${WORKER_ID}`);
  console.log(`• Portal Endpoint  : ${PORTAL_URL}`);
  console.log(`• Poll Cadence     : Every ${POLL_MS / 1000}s`);
  console.log(`• Claude Model     : ${MODEL}`);
  console.log(`================================================================\n`);

  let loopCount = 0;
  while (true) {
    try {
      loopCount++;
      // Periodically trigger background sync for dashboard tabs (every 60s)
      if (loopCount % 12 === 0) {
        fetch(`${PORTAL_URL}/api/analytics/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-SEO-Hub-Secret": WORKER_SECRET },
          body: JSON.stringify({ siteId: "safaeewala", source: "worker_cron" }),
        }).catch(() => {});
      }

      const job = await claimOnce();
      if (job) {
        await workOne(job);
        continue;
      }
    } catch (err) {
      console.error("[aks-worker] unexpected loop error:", err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
