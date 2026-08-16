/**
 * Type contract every skill module implements.
 *
 * `whenToUse` is a list of audit-kind slugs (same values stored in
 * seo_audits.kind). The composer pulls in every skill whose list
 * matches the current run's kind.
 */
export type SeoAuditKind =
  | "technical"
  | "on_page"
  | "alt_text"
  | "content_quality"
  | "content_gap"
  | "competitor"
  | "backlinks"
  | "accessibility"
  | "image_opt"
  | "local_seo"
  | "core_web_vitals"
  | "security"
  | "visual_design"
  | "ui_ux"
  // New-site greenfield builds — distinct discipline from auditing an
  // existing site. Activates the static-site build playbook skill.
  | "static_site_build";

export interface SeoSkill {
  /** Stable slug matching the Claude Code skill, where one exists. */
  slug: string;
  /** Human-readable label shown in /admin/seo. */
  title: string;
  /** Phase at which this skill becomes active in the platform. */
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /**
   * Prompt fragment injected into the agent's system message when this
   * skill is active. Should be opinionated and concrete — rules of
   * thumb, formulas, thresholds, anti-patterns. Avoid generic SEO
   * platitudes; the LLM already has those.
   */
  systemFragment: string;
  /**
   * Which audit kinds activate this skill. Empty array = manual / on
   * demand only.
   */
  whenToUse: SeoAuditKind[];
}
