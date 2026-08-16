/**
 * Suggestions — live data merged from real tables, rendered on the dark
 * cyan-grid canvas used across Agent Jobs / Automation.
 *
 * Reads from:
 *   - sitePatterns   (cross-site issues detected by patterns:detect cron)
 *   - seoProposals   (per-site fix inbox — status='pending')
 *   - agentTasks     (AI-proposed tasks — status='proposed')
 *   - qaChecks       (high/critical failures over the last 24 h)
 *   - agentSchedules (already-scheduled automations, used to skip duplicates)
 *
 * Server side: fetch + classify + rank + build automation suggestions.
 * Client side (SuggestionsHub): render on the dark canvas with pillar groups
 * and ring KPIs.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import {
  agentSchedules,
  agentTasks,
  qaChecks,
  seoProposals,
  sitePatterns,
} from "@/db/schema";
import { requireAdmin } from "@/lib/server-auth";
import {
  SuggestionsHub,
  type AutomationSuggestion,
  type CategoryId,
  type Suggestion,
} from "./SuggestionsHub";

export const dynamic = "force-dynamic";

/** Best-effort classifier for a sitePattern.kind → category. */
function classifyPattern(kind: string): CategoryId {
  const k = kind.toLowerCase();
  if (/(schema|meta|title|h1|internal_link|alt|on.?page)/.test(k)) return "on-page";
  if (/(backlink|referring|anchor|citation|off.?page)/.test(k)) return "off-page";
  if (/(cwv|lcp|inp|cls|crawl|redirect|canonical|indexation|noindex|robots|tech|drift)/.test(k)) return "technical";
  if (/(content|copy|thin|stale|freshness|blog|brief|word)/.test(k)) return "content";
  if (/(local|gmb|nap|review|neighbou?rhood|geo)/.test(k)) return "local";
  if (/(rank|position|serp|gsc|impression|ctr)/.test(k)) return "rank";
  return "on-page";
}

function classifySeoProposal(kind: string): CategoryId {
  const k = kind.toLowerCase();
  if (["meta_title", "meta_description", "schema_inject", "open_graph", "internal_link", "canonical", "alt_text", "aria_label"].includes(k)) return "on-page";
  if (["image_compress", "lazy_load", "redirect", "focus_visible", "rel_noopener"].includes(k)) return "technical";
  if (k === "content_rewrite") return "content";
  return "on-page";
}

/** Severity → impact label + effort estimate. */
function impactFromSeverity(
  severity: string,
): { impact: Suggestion["impact"]; effort: Suggestion["effort"]; time: string } {
  if (severity === "critical") return { impact: "critical",  effort: "large",   time: "2 hours" };
  if (severity === "warning")  return { impact: "high",      effort: "focused", time: "1 hour"  };
  return                             { impact: "medium",    effort: "quick",   time: "30 min" };
}

export default async function SuggestionsPage() {
  await ensureSchema();
  await requireAdmin();
  const d = db();
  const dayAgo = new Date(Date.now() - 24 * 3600_000);

  const [openPatterns, proposedTasks, pendingProposalsGrouped, qaFails, existingSchedules] = await Promise.all([
    d.select().from(sitePatterns).where(eq(sitePatterns.status, "open")).orderBy(desc(sitePatterns.detectedAt)).limit(20),
    d.select().from(agentTasks).where(eq(agentTasks.status, "proposed")).orderBy(desc(agentTasks.createdAt)).limit(20),
    d.select({ kind: seoProposals.kind, count: sql<number>`count(*)::int` })
      .from(seoProposals).where(eq(seoProposals.status, "pending")).groupBy(seoProposals.kind),
    d.select().from(qaChecks)
      .where(and(
        eq(qaChecks.status, "fail"),
        eq(qaChecks.suppressed, false),
        gte(qaChecks.createdAt, dayAgo),
      ))
      .orderBy(desc(qaChecks.createdAt))
      .limit(20),
    d.select({ taskType: agentSchedules.taskType, agentId: agentSchedules.agentId })
      .from(agentSchedules).where(eq(agentSchedules.enabled, true)),
  ]);

  /* Merge sources into a flat suggestion list, then rank by impact. */
  const raw: Suggestion[] = [];

  for (const p of openPatterns) {
    const { impact, effort, time } = impactFromSeverity(p.severity);
    raw.push({
      rank: 0,
      id: `pattern-${p.id}`,
      title: p.title,
      body: p.summary,
      impact,
      effort,
      time,
      category: classifyPattern(p.kind),
      href: "/admin/patterns",
      source: "pattern",
      agentLabel: null,
    });
  }
  for (const t of proposedTasks) {
    const impact: Suggestion["impact"] =
      t.priority === "high" ? "high" :
      t.priority === "low"  ? "medium" :
      "high";
    raw.push({
      rank: 0,
      id: `task-${t.id}`,
      title: t.title,
      body: t.description,
      impact,
      effort: "focused",
      time: "1 hour",
      category: classifyPattern(t.kind),
      href: "/admin/seo/sample-review",
      source: "agent-task",
      agentLabel: null,
    });
  }
  const qaGroups = new Map<string, { count: number; title: string; severity: string }>();
  for (const q of qaFails) {
    const severity = q.severity ?? "high";
    const key = `${q.checkKind}:${severity}`;
    const g = qaGroups.get(key);
    if (g) g.count += 1;
    else qaGroups.set(key, { count: 1, title: q.checkKind, severity });
  }
  for (const [key, g] of qaGroups) {
    const { impact, effort, time } = impactFromSeverity(g.severity);
    raw.push({
      rank: 0,
      id: `qa-${key}`,
      title: `Fix ${g.count} × ${g.title} failure${g.count === 1 ? "" : "s"}`,
      body: `${g.count} page${g.count === 1 ? "" : "s"} failed the ${g.title} check at ${g.severity} severity in the last 24 hours.`,
      impact,
      effort,
      time,
      category: "technical",
      href: "/admin/agent/qa",
      source: "qa-fail",
      agentLabel: null,
    });
  }
  // Attribute a rough "who should own this" agent chip for each suggestion.
  for (const s of raw) {
    s.agentLabel = defaultAgentFor(s.category);
  }

  const impactRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  raw.sort((a, b) => impactRank[a.impact] - impactRank[b.impact]);
  raw.forEach((s, i) => (s.rank = i + 1));
  const suggestions = raw.slice(0, 40);

  /* Aggregate KPI counters. */
  const highImpact = suggestions.filter((s) => s.impact === "critical" || s.impact === "high").length;
  const quickWins = suggestions.filter((s) => s.effort === "quick").length;
  const assigned = suggestions.filter((s) => s.agentLabel).length; // proxy — every suggestion gets a default agent

  /* Also fold pending SEO proposals into the category totals so the pillar
     counts reflect the whole inbox, not only the ranked slice. */
  const categoryCounts: Record<CategoryId, number> = {
    "on-page": 0, "off-page": 0, "technical": 0, "content": 0, "local": 0, "rank": 0,
  };
  for (const s of suggestions) categoryCounts[s.category] += 1;
  for (const p of pendingProposalsGrouped) {
    categoryCounts[classifySeoProposal(p.kind)] += p.count;
  }

  /* Automation suggestions — recurring work that isn't already scheduled. */
  const scheduledSet = new Set(existingSchedules.map((s) => `${s.agentId}:${s.taskType}`));
  const automation: AutomationSuggestion[] = [];

  const contentPatterns = openPatterns.filter((p) => classifyPattern(p.kind) === "content").length;
  if (contentPatterns >= 2 && !scheduledSet.has("blog:blog_writing")) {
    automation.push({
      id: "auto-blog-weekly",
      title: "Schedule a weekly blog post with Content Writer",
      body: `Detected ${contentPatterns} content-freshness signal${contentPatterns === 1 ? "" : "s"}. A recurring weekly post keeps the network trending.`,
      cadenceLabel: "Weekly · Mon 09:00",
      trigger: "recurring schedule",
      agentTitle: "Content Writer",
      agentId: "blog",
      taskType: "blog_writing",
      impact: "high",
      lift: "+content freshness",
      timing: "Next: Mon 09:00 GST",
    });
  }
  if (!scheduledSet.has("ranktracker:rank_sweep")) {
    automation.push({
      id: "auto-rank-weekly",
      title: "Weekly rank sweep with Ranking Monitor",
      body: "Full GSC keyword-set snapshot every Monday catches position drops before they compound.",
      cadenceLabel: "Weekly · Mon 06:00",
      trigger: "recurring schedule",
      agentTitle: "Ranking Monitor",
      agentId: "ranktracker",
      taskType: "rank_sweep",
      impact: "high",
      lift: "+early drop detection",
      timing: "Next: Mon 06:00 GST",
    });
  }
  if (!scheduledSet.has("research:keyword_research")) {
    automation.push({
      id: "auto-research-monthly",
      title: "Monthly keyword refresh with Research Agent",
      body: "Seasonal shifts (Ramadan, National Day, back-to-school move-in) demand a monthly cluster refresh.",
      cadenceLabel: "Monthly · 1st of month",
      trigger: "recurring schedule",
      agentTitle: "Research Agent",
      agentId: "research",
      taskType: "keyword_research",
      impact: "medium",
      lift: "+seasonal coverage",
      timing: "Next: 1st of month",
    });
  }
  const techPatterns = openPatterns.filter((p) => classifyPattern(p.kind) === "technical").length;
  if (techPatterns >= 1 && !scheduledSet.has("technical:technical_audit")) {
    automation.push({
      id: "auto-tech-weekly",
      title: "Weekly technical audit with Technical Expert",
      body: `${techPatterns} technical pattern${techPatterns === 1 ? "" : "s"} open. Weekly audit catches CWV regressions and redirect chains.`,
      cadenceLabel: "Weekly · Sun 04:00",
      trigger: "recurring schedule",
      agentTitle: "Technical Expert",
      agentId: "technical",
      taskType: "technical_audit",
      impact: "high",
      lift: "+CWV stability",
      timing: "Next: Sun 04:00 GST",
    });
  }
  if (!scheduledSet.has("ranktracker:competitor_rank_watch")) {
    automation.push({
      id: "auto-competitor-weekly",
      title: "Weekly competitor rank watch with Ranking Monitor",
      body: "Snapshot dubizzle, Yalla.ae, ServiceMarket, Urban Company, Justmop on money keywords.",
      cadenceLabel: "Weekly · Wed 07:00",
      trigger: "recurring schedule",
      agentTitle: "Ranking Monitor",
      agentId: "ranktracker",
      taskType: "competitor_rank_watch",
      impact: "medium",
      lift: "+competitor visibility",
      timing: "Next: Wed 07:00 GST",
    });
  }

  const usingRealData = openPatterns.length + proposedTasks.length + qaFails.length > 0;

  return (
    <SuggestionsHub
      suggestions={suggestions}
      categoryCounts={categoryCounts}
      totalCount={suggestions.length}
      assignedCount={assigned}
      highImpactCount={highImpact}
      quickWinsCount={quickWins}
      automation={automation}
      empty={!usingRealData}
    />
  );
}

/** Best-effort attribution — matches the app's built-in agents. */
function defaultAgentFor(cat: CategoryId): string {
  switch (cat) {
    case "on-page":   return "On-Page Expert";
    case "off-page":  return "Off-Page Expert";
    case "technical": return "Technical Expert";
    case "content":   return "Content Writer";
    case "local":     return "On-Page Expert";
    case "rank":      return "Ranking Monitor";
  }
}
