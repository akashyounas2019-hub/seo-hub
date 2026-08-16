/**
 * P8 — Business context extraction server actions.
 *
 * Two surfaces:
 *   1. extractBusinessContextAction — runs Haiku against the operator's
 *      pasted markdown, stashes the result in a transient form (returned
 *      JSON), does NOT yet write to project.business_facts.
 *   2. saveBusinessFactsAction — operator clicks "Save" after reviewing
 *      the preview; this merges into project.business_facts (preserving
 *      anything already there). Audit-logged.
 *
 * Why two steps: the extractor is conservative but not perfect. The
 * operator may need to delete a hallucinated rate or paste in a real
 * phone number. We surface a side-by-side preview between the two
 * actions so they can edit before commit.
 */

"use server";

import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { siteBuildProjects } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import {
  type BusinessFacts,
  extractBusinessFacts,
  mergeBusinessFacts,
} from "@/lib/business-context-extractor";
import { requireAdmin } from "@/lib/server-auth";

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

export interface ExtractActionResult {
  ok: boolean;
  error?: string;
  /** New facts that came out of the extractor. */
  extracted?: BusinessFacts;
  /** Merged preview — what the operator will save if they hit Save. */
  preview?: BusinessFacts;
  /** Field-level meta from the extractor for the UI to highlight. */
  uncertain?: Array<{ field: string; suspected_value: unknown; reason: string }>;
  confident?: string[];
  unmapped?: string[];
  tokensInput?: number;
  tokensOutput?: number;
}

/**
 * Run the extractor against an operator-pasted markdown blob.
 * Does NOT persist — returns the structured result for preview.
 */
export async function extractBusinessContextAction(
  prev: ExtractActionResult | undefined,
  formData: FormData,
): Promise<ExtractActionResult> {
  void prev;
  try {
    await ensureSchema();
    const me = await requireAdmin();
    const projectId = s(formData, "projectId");
    const markdown = s(formData, "markdown");

    if (!projectId) return { ok: false, error: "missing-projectId" };
    if (!markdown) return { ok: false, error: "empty-markdown" };
    if (markdown.length > 200_000) {
      return { ok: false, error: "markdown-too-large" };
    }

    const [project] = await db()
      .select()
      .from(siteBuildProjects)
      .where(eq(siteBuildProjects.id, projectId))
      .limit(1);
    if (!project) return { ok: false, error: "unknown-project" };

    const result = await extractBusinessFacts({
      markdown,
      businessName: project.businessName,
      targetCity: project.city ?? undefined,
    });

    const existing = (project.businessFacts ?? null) as BusinessFacts | null;
    const preview = mergeBusinessFacts(existing, result.facts);

    await recordAdminAction({
      actor: me,
      kind: "build.business_facts_extract",
      targetType: "other",
      targetId: project.id,
      summary: `Extracted business facts from ${markdown.length} chars of notes — confident: ${result.confident_fields.join(", ") || "none"}`,
    });

    return {
      ok: true,
      extracted: result.facts,
      preview,
      uncertain: result.uncertain_fields,
      confident: result.confident_fields,
      unmapped: result.unmapped_topics,
      tokensInput: result.tokens_input,
      tokensOutput: result.tokens_output,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.slice(0, 500) };
  }
}

/**
 * Persist the (possibly operator-edited) facts blob to project.business_facts.
 * Accepts a JSON-stringified payload from the preview UI.
 */
export async function saveBusinessFactsAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const projectId = s(formData, "projectId");
  const factsJson = s(formData, "factsJson");

  if (!projectId || !factsJson) return;

  let parsed: BusinessFacts;
  try {
    parsed = JSON.parse(factsJson) as BusinessFacts;
  } catch {
    return;
  }

  const [project] = await db()
    .select()
    .from(siteBuildProjects)
    .where(eq(siteBuildProjects.id, projectId))
    .limit(1);
  if (!project) return;

  const existing = (project.businessFacts ?? null) as BusinessFacts | null;
  const merged = mergeBusinessFacts(existing, parsed);

  await db()
    .update(siteBuildProjects)
    .set({ businessFacts: merged as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(siteBuildProjects.id, project.id));

  await recordAdminAction({
    actor: me,
    kind: "build.business_facts_saved",
    targetType: "other",
    targetId: project.id,
    summary: `Saved business facts — ${Object.keys(merged).length} key(s) total`,
  });
}
