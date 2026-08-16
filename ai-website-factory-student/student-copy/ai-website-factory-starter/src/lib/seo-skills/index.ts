/**
 * SEO skill registry.
 *
 * The agent doesn't have a single monolithic prompt — instead each
 * discipline (keyword research, on-page, technical, content strategy,
 * etc.) lives in its own module here. The runner composes the relevant
 * subset into the system prompt based on the audit kind. This lets one
 * skill be improved without touching the others and keeps each prompt
 * short enough to stay in the Anthropic prompt cache.
 *
 * Naming convention: each skill's `slug` matches a real Claude Code
 * skill on Wali's machine so the encoded methodology stays in sync with
 * what he uses interactively (keyword-research, seo-technical, etc.).
 */
import type { SeoAuditKind } from "./types";

import { keywordResearch } from "./keyword-research";
import { onPageSeo } from "./on-page-seo";
import { technicalSeo } from "./technical-seo";
import { contentStrategy } from "./content-strategy";
import { localSeo } from "./local-seo";
import { competitorAnalysis } from "./competitor-analysis";
import { copywriting } from "./copywriting";
import { schemaMarkup } from "./schema-markup";
import { pageCro } from "./page-cro";
import { aiSeo } from "./ai-seo";
import { visualDesign } from "./visual-design";
import { staticSiteBuildPlaybook } from "./static-site-build-playbook";

export type { SeoSkill, SeoAuditKind } from "./types";

export const SKILLS = [
  keywordResearch,
  onPageSeo,
  technicalSeo,
  contentStrategy,
  localSeo,
  competitorAnalysis,
  copywriting,
  schemaMarkup,
  pageCro,
  aiSeo,
  visualDesign,
  staticSiteBuildPlaybook,
] as const;

/**
 * Select the skills relevant to a given audit kind. The agent's system
 * prompt becomes:
 *
 *   [base persona]
 *   [skill 1 systemFragment]
 *   [skill 2 systemFragment]
 *   ...
 *
 * Each skill declares which audit kinds it applies to via `whenToUse`,
 * keyed by the same enum we store in `seo_audits.kind`.
 */
export function selectSkills(kind: SeoAuditKind) {
  return SKILLS.filter((s) => s.whenToUse.includes(kind));
}

/**
 * Build the composed system prompt for an audit run. `basePersona` is
 * the role description (kept short so each skill's contribution stays
 * the dominant signal).
 */
export function composeSystemPrompt(kind: SeoAuditKind, basePersona: string): string {
  const skills = selectSkills(kind);
  const parts: string[] = [basePersona];
  if (skills.length > 0) {
    parts.push("\n--- ACTIVE SKILLS ---\n");
    for (const skill of skills) {
      parts.push(`## ${skill.title}\n${skill.systemFragment.trim()}\n`);
    }
  }
  return parts.join("\n");
}

/** Skill manifest — used by /admin/seo to show which skills are loaded. */
export function listSkills() {
  return SKILLS.map((s) => ({
    slug: s.slug,
    title: s.title,
    phase: s.phase,
    appliesTo: s.whenToUse,
  }));
}

/**
 * Compose every skill into a single system prompt. Used by the chat agent
 * (where any topic can come up) and the build workflow (where we want all
 * disciplines available without picking a single audit kind).
 *
 * The "--- ACTIVE SKILLS ---" delimiter is intentionally identical to
 * `composeSystemPrompt()` so Anthropic's prompt cache still matches the
 * shared prefix even when the active set changes.
 */
export function composeAllSkills(basePersona: string): string {
  const parts: string[] = [basePersona];
  parts.push("\n--- ACTIVE SKILLS ---\n");
  for (const skill of SKILLS) {
    parts.push(`## ${skill.title}\n${skill.systemFragment.trim()}\n`);
  }
  return parts.join("\n");
}
