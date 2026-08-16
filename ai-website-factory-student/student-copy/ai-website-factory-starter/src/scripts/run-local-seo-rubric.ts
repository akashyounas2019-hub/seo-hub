/**
 * CLI for the Local SEO Rubric auditor.
 *
 * Usage:
 *   npm run rubric:audit -- --site=spotless-cleaning-dubai
 *   npm run rubric:audit -- --project=<uuid>
 *   npm run rubric:audit -- --site=<slug> --no-judge      # deterministic only
 *   npm run rubric:audit -- --site=<slug> --max=5         # spot-check 5 pages
 *
 * Prints a per-page table + site rollup. Writes one row to
 * local_seo_rubric_audits per page. Subsequent runs add new rows
 * (history is preserved).
 */

import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { sites, siteBuildProjects } from "../db/schema";
import { auditBuildProject, auditLiveSite, type RunnerResult } from "../lib/local-seo-rubric-runner";

function arg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  // boolean flag: --foo
  if (process.argv.includes(`--${name}`)) return "true";
  return fallback;
}

async function main() {
  await ensureSchema();
  const siteArg = arg("site");
  const projectArg = arg("project");
  const noJudge = arg("no-judge") === "true";
  const maxArg = arg("max");
  const maxPages = maxArg ? parseInt(maxArg, 10) : undefined;

  if (!siteArg && !projectArg) {
    console.error("Usage: npm run rubric:audit -- (--site=<slug> | --project=<uuid>) [--no-judge] [--max=N]");
    process.exit(1);
  }

  const opts = { runJudge: !noJudge, maxPages };
  let result: RunnerResult;

  if (siteArg) {
    const [site] = await db().select().from(sites).where(eq(sites.slug, siteArg)).limit(1);
    if (!site) {
      console.error(`Unknown site slug: ${siteArg}`);
      process.exit(1);
    }
    console.log(`[rubric] Auditing LIVE site: ${site.name} (${site.slug}) — judge=${!noJudge}`);
    result = await auditLiveSite(site.id, opts);
  } else {
    const [project] = await db().select().from(siteBuildProjects).where(eq(siteBuildProjects.id, projectArg!)).limit(1);
    if (!project) {
      console.error(`Unknown project id: ${projectArg}`);
      process.exit(1);
    }
    console.log(`[rubric] Auditing BUILD project: ${project.businessName} — judge=${!noJudge}`);
    result = await auditBuildProject(project.id, opts);
  }

  // ── Print table ───────────────────────────────────────────────
  console.log("");
  console.log(`  Source     : ${result.source}`);
  console.log(`  Total pages: ${result.totalPages}`);
  console.log(`  Audited    : ${result.audited}`);
  console.log(`  Failed     : ${result.failed}`);
  console.log(`  Avg score  : ${result.averageScore}/100`);
  if (result.judgeTokensInput > 0) {
    console.log(`  Judge cost : ${result.judgeTokensInput.toLocaleString()} in / ${result.judgeTokensOutput.toLocaleString()} out tokens (~$${estimateHaikuCostUsd(result.judgeTokensInput, result.judgeTokensOutput).toFixed(4)})`);
  }
  console.log("");
  console.log("Per-page breakdown:");
  const sorted = [...result.perPageAudits].sort((a, b) => a.overallScore - b.overallScore);
  for (const p of sorted) {
    const bar = scoreBar(p.overallScore);
    const flags = [];
    if (p.findingsBlocking > 0) flags.push(`${p.findingsBlocking}🔴`);
    if (p.findingsHigh > 0) flags.push(`${p.findingsHigh}🟠`);
    const flagStr = flags.length > 0 ? "  " + flags.join(" ") : "";
    console.log(`  ${p.overallScore.toString().padStart(3)} ${bar}  ${p.pageType.padEnd(10)} ${p.url}${flagStr}`);
  }
  process.exit(result.audited > 0 ? 0 : 1);
}

function scoreBar(score: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(score / 10)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function estimateHaikuCostUsd(inputTokens: number, outputTokens: number): number {
  // Haiku 4.5 pricing as of 2026: $1/MTok input, $5/MTok output.
  return (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;
}

main().catch((err) => {
  console.error("[rubric] fatal:", err);
  process.exit(2);
});
