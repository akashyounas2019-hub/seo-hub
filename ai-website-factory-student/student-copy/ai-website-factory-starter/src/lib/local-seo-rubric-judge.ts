/**
 * Local SEO Rubric — Haiku judge.
 *
 * Runs the SUBJECTIVE checks (mode: "judge") against the page evidence
 * and returns pass/fail verdicts the checker can integrate into the
 * final score.
 *
 * Why Haiku: judge questions are short, structured, and benefit from
 * the cheap tier. Each page audit costs ~$0.0002 input + $0.0002 output
 * with Haiku 4.5. A 50-page site audit costs ~$0.02 — basically free.
 *
 * Each judge call returns one JSON verdict per pending check. The
 * checker then patches the original finding from "needs_judge" to
 * "pass" or "fail" based on the verdict.
 */

import { getLLMClient } from "./llm";
import type Anthropic from "@anthropic-ai/sdk";
import type { RubricCheck, RubricPageType } from "./local-seo-rubric";
import type { RubricCheckerResult, RubricFinding } from "./local-seo-rubric-checker";

export interface JudgeVerdict {
  checkId: string;
  pass: boolean;
  /** Confidence 0-100. Below 50 = the model is hedging — treat as warn. */
  confidence: number;
  /** One-sentence rationale shown in the UI. */
  rationale: string;
}

export interface JudgeResult {
  verdicts: JudgeVerdict[];
  tokensInput: number;
  tokensOutput: number;
  model: string;
}

const JUDGE_SYSTEM = `You are a strict Local SEO auditor evaluating one web page against a checklist of subjective quality criteria.

You will receive:
1. The page's URL, primary keyword, target city, and page type
2. Excerpted evidence the deterministic checker already extracted (headings, sample paragraphs, schema types, etc.)
3. A list of "judge questions" — each is a single SUBJECTIVE check the checker couldn't decide

For each judge question, respond with a clear PASS or FAIL plus a confidence score 0-100.

Your default bias is SKEPTICAL. The audit's value comes from catching low-effort content:
- "Trusted for years" with no number = FAIL
- "Serving Dubai area" with no named neighborhoods = FAIL
- FAQs that are obviously keyword-stuffed and not conversational = FAIL
- Case studies that are generic ("we cleaned a house") = FAIL
- Reviews that don't mention the city = FAIL for location pages

But you also need to recognize when good content IS there:
- "10+ years serving Manchester homeowners, BBB A+ rated since 2014, NICEIC certified" = PASS for EEAT
- "Recently cleaned a 3-storey home in Heaton Moor with severe gutter overflow" = PASS for local case study
- Conversational FAQ like "Q: How often should I clean my gutters? A: Twice a year for most UK homes — once after autumn leaf-fall and again in spring." = PASS for conversational tone

Output STRICT JSON, no prose outside the JSON. Schema:
{
  "verdicts": [
    { "checkId": "homepage_eeat", "pass": true, "confidence": 85, "rationale": "Page lists 14 years, BBB rating, named certifications" },
    { "checkId": "location_landmarks", "pass": false, "confidence": 90, "rationale": "Says 'serving Dubai area' but names no neighborhoods or landmarks" }
  ]
}`;

interface JudgePromptInput {
  url: string;
  pageType: RubricPageType;
  primaryKeyword?: string;
  city?: string;
  pendingChecks: RubricCheck[];
  evidence: RubricCheckerResult["evidence"];
}

function buildJudgePrompt(input: JudgePromptInput): string {
  const ev = input.evidence;
  // Take first 5 H1/H2/H3 headings + first 8 paragraphs (capped at 200 chars each)
  const importantHeadings = ev.headings.filter((h) => h.level <= 3).slice(0, 8);
  const sampleParas = ev.paragraphs.slice(0, 12).map((p) => p.length > 300 ? p.slice(0, 300) + "…" : p);

  const lines: string[] = [];
  lines.push(`PAGE METADATA:`);
  lines.push(`- URL: ${input.url}`);
  lines.push(`- Page type: ${input.pageType}`);
  if (input.primaryKeyword) lines.push(`- Primary keyword: ${input.primaryKeyword}`);
  if (input.city) lines.push(`- Target city: ${input.city}`);
  lines.push(`- Title: ${ev.title || "(missing)"}`);
  lines.push(`- Word count: ${ev.wordCount}`);
  lines.push(`- Schema types: ${ev.schemaTypes.length > 0 ? ev.schemaTypes.join(", ") : "(none)"}`);
  lines.push(`- Internal links: ${ev.internalLinks}, external: ${ev.externalLinks}, images: ${ev.imageCount}`);
  lines.push(`- Sections detected: ${ev.sectionsDetected.length > 0 ? ev.sectionsDetected.join(", ") : "(none)"}`);
  lines.push(`- Entities mentioned: ${ev.entitiesFound.length > 0 ? ev.entitiesFound.slice(0, 15).join(", ") : "(none)"}`);
  lines.push(``);
  lines.push(`HEADINGS (H1-H3):`);
  for (const h of importantHeadings) {
    lines.push(`  H${h.level}: ${h.text.slice(0, 200)}`);
  }
  lines.push(``);
  lines.push(`SAMPLE PARAGRAPHS:`);
  for (const p of sampleParas) {
    lines.push(`- ${p}`);
  }
  lines.push(``);
  lines.push(`JUDGE QUESTIONS (evaluate each, return verdicts):`);
  for (const check of input.pendingChecks) {
    lines.push(`- checkId: "${check.id}" — ${check.description}`);
  }
  lines.push(``);
  lines.push(`Return ONLY a JSON object with the "verdicts" array. One verdict per checkId above.`);
  return lines.join("\n");
}

/**
 * Run the Haiku judge against the pending subjective checks.
 * Returns verdicts the caller can use to patch the deterministic findings.
 */
export async function runRubricJudge(input: {
  pageInput: { url: string; pageType: RubricPageType; primaryKeyword?: string; city?: string };
  checkerResult: RubricCheckerResult;
  client?: Anthropic;
}): Promise<JudgeResult> {
  const pending = input.checkerResult.pendingJudge;
  if (pending.length === 0) {
    return { verdicts: [], tokensInput: 0, tokensOutput: 0, model: "noop" };
  }

  const client = input.client ?? (await getLLMClient({ tier: "cheap" })).client;
  const model = "claude-haiku-4-5";

  const prompt = buildJudgePrompt({
    url: input.pageInput.url,
    pageType: input.pageInput.pageType,
    primaryKeyword: input.pageInput.primaryKeyword,
    city: input.pageInput.city,
    pendingChecks: pending,
    evidence: input.checkerResult.evidence,
  });

  const resp = await client.messages.create({
    model,
    max_tokens: 4096,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

  // Strip code fences if present
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : rawText;

  let parsed: { verdicts: JudgeVerdict[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = { verdicts: [] };
  }
  const verdicts = Array.isArray(parsed.verdicts) ? parsed.verdicts : [];

  return {
    verdicts,
    tokensInput: resp.usage.input_tokens,
    tokensOutput: resp.usage.output_tokens,
    model,
  };
}

/**
 * Patch a checker result's findings using judge verdicts.
 * Pure: returns a NEW findings array, doesn't mutate the original.
 */
export function applyJudgeVerdicts(
  result: RubricCheckerResult,
  verdicts: JudgeVerdict[],
): { findings: RubricFinding[]; overallScore: number; scores: RubricCheckerResult["scores"] } {
  const byCheckId = new Map<string, JudgeVerdict>(verdicts.map((v) => [v.checkId, v]));
  const findings = result.findings.map((f) => {
    if (f.status !== "needs_judge") return f;
    const v = byCheckId.get(f.checkId);
    if (!v) return f; // judge didn't return a verdict — leave pending
    const conf = Math.max(0, Math.min(100, v.confidence ?? 0));
    if (conf < 50) {
      return { ...f, status: "warn" as const, message: `${f.message.replace(/^Pending LLM judge: /, "")} — judge is uncertain: ${v.rationale}` };
    }
    if (v.pass) {
      return { ...f, status: "pass" as const, message: v.rationale };
    }
    return { ...f, status: "fail" as const, message: v.rationale };
  });

  // Recompute scores with patched statuses.
  const max = result.findings.reduce((sum, f) => sum + f.weight, 0);
  let awarded = 0;
  for (const f of findings) {
    if (f.status === "pass") awarded += f.weight;
    else if (f.status === "warn" || f.status === "needs_judge") awarded += f.weight * 0.5;
  }
  const overallScore = max > 0 ? Math.round((awarded / max) * 100) : 0;

  // Recompute per-category scores
  const byCategory: Record<string, { total: number; awarded: number }> = {};
  for (const f of findings) {
    byCategory[f.category] = byCategory[f.category] ?? { total: 0, awarded: 0 };
    byCategory[f.category].total += f.weight;
    if (f.status === "pass") byCategory[f.category].awarded += f.weight;
    else if (f.status === "warn" || f.status === "needs_judge") byCategory[f.category].awarded += f.weight * 0.5;
  }
  const scores = { ...result.scores };
  for (const cat of Object.keys(byCategory)) {
    const { total, awarded: a } = byCategory[cat];
    if (total > 0) (scores as Record<string, number>)[cat] = Math.round((a / total) * 100);
  }

  return { findings, overallScore, scores };
}
