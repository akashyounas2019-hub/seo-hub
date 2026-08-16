/**
 * Per-kind config shape + defaults for admin-configurable alert_rules.
 * Each built-in check kind has its own threshold knobs; this is the single
 * place that documents them so the Alert Manager UI and the check functions
 * agree on field names without either side guessing.
 */

export interface RuleFieldDef {
  key: string;
  label: string;
  type: "number" | "text";
  defaultValue: number | string;
  hint?: string;
  min?: number;
  max?: number;
}

export interface RuleKindDef {
  kind: string;
  label: string;
  description: string;
  fields: RuleFieldDef[];
}

export const RULE_KINDS: RuleKindDef[] = [
  {
    kind: "traffic_drop",
    label: "Traffic drop",
    description: "Fires when a site's daily GSC clicks fall well below its 7-day median.",
    fields: [
      { key: "warnPct", label: "Warn threshold (%)", type: "number", defaultValue: 15, min: 1, max: 99, hint: "Drop vs 7-day median to trigger a warning." },
      { key: "errorPct", label: "Error threshold (%)", type: "number", defaultValue: 30, min: 1, max: 99 },
      { key: "criticalPct", label: "Critical threshold (%)", type: "number", defaultValue: 50, min: 1, max: 99 },
    ],
  },
  {
    kind: "plugin_drift",
    label: "Plugin version drift",
    description: "Fires when a site's gyl-bookings plugin version falls behind the target.",
    fields: [
      { key: "targetVersion", label: "Target version", type: "text", defaultValue: "0.25.0", hint: "Semver, e.g. 0.25.0. Overrides GYL_TARGET_PLUGIN_VERSION." },
    ],
  },
  {
    kind: "site_unreachable",
    label: "Site unreachable",
    description: "Fires when a site's homepage returns 4xx/5xx or fails to connect.",
    fields: [],
  },
  {
    kind: "sitemap_regression",
    label: "Sitemap regression",
    description: "Fires when a site's sitemap is unreachable or sampled URLs return errors.",
    fields: [
      { key: "sampleSize", label: "URLs to sample", type: "number", defaultValue: 5, min: 1, max: 40 },
    ],
  },
  {
    kind: "worker_death",
    label: "Worker stuck / dead",
    description: "Fires when claude_jobs pile up pending or stay claimed/running too long.",
    fields: [
      { key: "pendingGraceMinutes", label: "Pending grace (minutes)", type: "number", defaultValue: 20, min: 1, max: 1440 },
      { key: "runningTooLongMinutes", label: "Running-too-long (minutes)", type: "number", defaultValue: 15, min: 1, max: 1440 },
    ],
  },
];

export function ruleKindDef(kind: string): RuleKindDef | undefined {
  return RULE_KINDS.find((k) => k.kind === kind);
}

/** Merge a rule's stored config with the kind's field defaults (handles partial/missing config). */
export function configWithDefaults(kind: string, config: Record<string, unknown>): Record<string, number | string> {
  const def = ruleKindDef(kind);
  const out: Record<string, number | string> = {};
  for (const f of def?.fields ?? []) {
    const v = config[f.key];
    out[f.key] = v === undefined || v === null || v === "" ? f.defaultValue : (f.type === "number" ? Number(v) : String(v));
  }
  return out;
}
