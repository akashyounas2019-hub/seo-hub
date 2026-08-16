/**
 * Niche resolver — the single place that decides what "industry" a build
 * project is for. Every agent (keyword research, content, design) threads this
 * value through its prompts so the whole factory adapts to whatever niche the
 * operator typed once in the new-project wizard.
 *
 * Priority:
 *   1. `project.niche` — the operator's explicit answer (e.g. "dental clinic").
 *   2. A label derived from the service mix or business name (best-effort).
 *   3. The neutral fallback "local service business".
 */

type NicheSource = {
  niche?: string | null;
  services?: unknown;
  businessName?: string | null;
};

const FALLBACK = "local service business";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Resolve the niche label for a build project. Always returns a non-empty string. */
export function resolveNiche(project: NicheSource | null | undefined): string {
  if (!project) return FALLBACK;

  const explicit = clean(project.niche);
  if (explicit) return explicit;

  // Derive from services — e.g. ["Teeth Whitening", "Implants"] → "Teeth Whitening service".
  const services = Array.isArray(project.services)
    ? (project.services as unknown[]).map(clean).filter(Boolean)
    : [];
  if (services.length > 0) {
    return `${services[0]} business`;
  }

  // Derive from business name — strip a leading place/qualifier, keep it generic.
  const name = clean(project.businessName);
  if (name) {
    return `${name} business`;
  }

  return FALLBACK;
}
