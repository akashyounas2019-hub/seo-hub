/**
 * One-shot QA runner — invoked by the Claude agent when the worker is not
 * polling. Runs the Playwright suite, prints JSON results to stdout, and
 * optionally POSTs findings to the API (AKS_WORKER_PORTAL_URL, default
 * http://localhost:3333).
 *
 * Usage:
 *   node worker/run-qa-once.mjs <runId> <siteId> <baseUrl> <scope> [targetUrl]
 */
import { runQaSuite } from "./qa-engine.mjs";

const [,, runId, siteId, baseUrl, scope, targetUrl] = process.argv;

if (!runId || !siteId || !baseUrl || !scope) {
  console.error("Usage: run-qa-once.mjs <runId> <siteId> <baseUrl> <scope> [targetUrl]");
  process.exit(1);
}

const PORTAL = process.env.AKS_WORKER_PORTAL_URL || "http://localhost:3333";

async function api(path, init = {}) {
  try {
    const res = await fetch(`${PORTAL}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[api] ${path} → ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    return JSON.parse(text);
  } catch (e) {
    console.warn(`[api] ${path} failed: ${e.message}`);
    return null;
  }
}

const started = Date.now();
console.log(`[qa-runner] starting runId=${runId} scope=${scope} target=${targetUrl || baseUrl}`);

await api(`/api/qa/runs/${runId}/status`, {
  method: "POST",
  body: JSON.stringify({ status: "running" }),
});

let findings = [];
let pagesChecked = 0;
let exitCode = 0;

try {
  const result = await runQaSuite({ baseUrl, scope, targetUrl });
  findings = result.findings;
  pagesChecked = result.pagesChecked;
  const durationMs = Date.now() - started;

  console.log(`[qa-runner] suite done — ${pagesChecked} page(s), ${findings.length} check(s)`);

  const postResult = await api(`/api/qa/runs/${runId}/complete`, {
    method: "POST",
    body: JSON.stringify({ findings, pagesChecked, durationMs }),
  });

  if (postResult?.ok) {
    console.log(`[qa-runner] findings saved — status: ${postResult.status}`);
  } else {
    console.warn("[qa-runner] API save failed — printing findings to stdout");
    console.log(JSON.stringify({ runId, pagesChecked, durationMs, findings }, null, 2));
  }
} catch (err) {
  console.error(`[qa-runner] fatal: ${err.message}`);
  exitCode = 1;
  await api(`/api/qa/runs/${runId}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "failed", error: err.message }),
  });
}

process.exit(exitCode);
