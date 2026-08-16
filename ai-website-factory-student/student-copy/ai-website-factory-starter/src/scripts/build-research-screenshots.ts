/**
 * CLI for capturing competitor screenshots for a site-build project.
 *
 * Usage:
 *   npm run build:screenshots -- --project=<projectId>
 *   npm run build:screenshots -- --project=<projectId> --force   # re-capture all
 *
 * The chat agent can also trigger this via the `capture_research_screenshots`
 * tool — that path runs the same `captureProjectScreenshots()` function
 * inline. The CLI exists so you can re-run captures from the VPS without
 * touching the chat surface.
 */

import { ensureSchema } from "../db/client";
import {
  enqueueCapturesForProject,
  captureProjectScreenshots,
} from "../lib/build-screenshot-capture";

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] ?? "true");
}

async function main() {
  const projectId = args.get("project");
  if (!projectId) {
    console.error("Usage: build:screenshots -- --project=<projectId> [--force]");
    process.exit(1);
  }

  await ensureSchema();

  console.log(`[build-screenshots] enqueueing captures for ${projectId}…`);
  const { enqueued, alreadyKnown, competitors } = await enqueueCapturesForProject(projectId);
  console.log(
    `[build-screenshots] competitors found: ${competitors.length}, enqueued: ${enqueued}, already-known: ${alreadyKnown}`,
  );

  if (competitors.length === 0) {
    console.log("[build-screenshots] no competitor URLs found in research output");
    return;
  }

  console.log("[build-screenshots] firing Playwright…");
  const result = await captureProjectScreenshots(projectId, {
    force: args.get("force") === "true",
  });
  console.log(
    `[build-screenshots] done · total=${result.total} captured=${result.captured} failed=${result.failed} skipped=${result.skipped}`,
  );
  for (const r of result.results) {
    const tag = r.status === "captured" ? "OK " : r.status === "failed" ? "ERR" : "SKP";
    console.log(`  ${tag} ${r.hostname} ${r.bytes ? `· ${(r.bytes / 1024).toFixed(0)} KB` : ""} ${r.error ?? ""}`);
  }
}

main().catch((err) => {
  console.error("[build-screenshots] crashed:", err);
  process.exit(1);
});
