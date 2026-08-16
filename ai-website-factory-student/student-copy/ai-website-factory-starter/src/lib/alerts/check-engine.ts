/**
 * Alert check engine.
 *
 * Each check function returns AlertCandidate[]. The engine handles dedup
 * (by fingerprint), upsert (first_seen on insert, last_seen + occurrences
 * on existing), and auto-resolution (if a previously-open alert isn't in
 * the latest candidates, mark resolved). The cron route calls runAllChecks()
 * every 15 minutes.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { alerts, alertCheckRuns, alertRules, users, type NewAlert } from "@/db/schema";
import { configWithDefaults } from "./rule-config";
import { notify } from "@/lib/notifications";

export type AlertSeverity = "info" | "warn" | "error" | "critical";

export interface AlertCandidate {
  kind: string;
  severity: AlertSeverity;
  siteId: string | null;
  /** Stable identity within the kind — e.g., "<siteId>" or "<siteId>:<url>". */
  entity: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
}

export interface CheckResult {
  candidates: AlertCandidate[];
  /** ms duration of the check. */
  durationMs: number;
  /** First-line summary of what the check looked at. */
  observed?: string;
  error?: string;
}

export interface CheckDef {
  kind: string;
  run: () => Promise<CheckResult>;
}

/** Build a stable fingerprint that survives across runs. */
export function fingerprint(kind: string, siteId: string | null, entity: string): string {
  return `${kind}::${siteId ?? "global"}::${entity}`;
}

/**
 * Look up the admin-configured rule for a check kind, preferring a
 * site-scoped rule over a global (siteId IS NULL) one. Returns the merged
 * config (with kind defaults backfilled) plus the rule row itself so
 * callers can read severityOverride / notify settings. Disabled rules are
 * ignored — the check falls back to its own hardcoded defaults.
 */
export async function getRuleConfig(
  kind: string,
  siteId: string | null,
): Promise<{ rule: typeof alertRules.$inferSelect | null; config: Record<string, number | string> }> {
  const rows = await db()
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.kind, kind),
        eq(alertRules.enabled, true),
        siteId ? or(eq(alertRules.siteId, siteId), isNull(alertRules.siteId)) : isNull(alertRules.siteId),
      ),
    );
  if (rows.length === 0) return { rule: null, config: configWithDefaults(kind, {}) };
  // Prefer the site-scoped row when both a global and a site-specific rule exist.
  const rule = rows.find((r) => r.siteId === siteId) ?? rows[0];
  return { rule, config: configWithDefaults(kind, rule.config) };
}

/** Fire a notification for a brand-new alert instance, if a matching rule asked for one. */
async function notifyForNewAlert(c: AlertCandidate, rule: typeof alertRules.$inferSelect | null): Promise<void> {
  if (!rule) return;
  if (!rule.notifyEmail && !rule.notifyInApp) return;
  if (rule.notifyUserIds.length === 0) return;
  const recipients = await db().select().from(users).where(inArray(users.id, rule.notifyUserIds));
  for (const u of recipients) {
    await notify({
      user: u,
      kind: "alert_rule_triggered",
      title: c.title,
      body: c.body ?? `Alert rule "${rule.name}" matched.`,
      href: "/admin/alerts",
    }).catch((err) => console.error("[check-engine] notify failed", err));
  }
}

/** Upsert a single candidate. Returns whether it was new. */
async function upsertCandidate(c: AlertCandidate, rule: typeof alertRules.$inferSelect | null = null): Promise<"new" | "updated"> {
  const severity = rule?.severityOverride ?? c.severity;
  const fp = fingerprint(c.kind, c.siteId, c.entity);
  const now = new Date();

  // Try to find an existing alert with this fingerprint.
  const [existing] = await db()
    .select({ id: alerts.id, status: alerts.status, occurrences: alerts.occurrences })
    .from(alerts)
    .where(eq(alerts.fingerprint, fp))
    .limit(1);

  if (existing) {
    // Bump last_seen + occurrences. If the alert was previously resolved, re-open it
    // (the condition is back) — but leave dismissed alerts alone (user said "don't show me this").
    const reopen = existing.status === "resolved";
    await db()
      .update(alerts)
      .set({
        lastSeenAt: now,
        occurrences: existing.occurrences + 1,
        ...(reopen
          ? { status: "open", resolvedAt: null }
          : {}),
        payload: c.payload ?? {},
        title: c.title,
        body: c.body ?? null,
        severity,
      })
      .where(eq(alerts.id, existing.id));
    return "updated";
  }

  const row: NewAlert = {
    kind: c.kind,
    severity,
    status: "open",
    siteId: c.siteId,
    fingerprint: fp,
    title: c.title,
    body: c.body ?? null,
    payload: c.payload ?? {},
  };
  await db().insert(alerts).values(row);
  await notifyForNewAlert(c, rule);
  return "new";
}

/** Mark alerts of this kind whose fingerprint isn't in `seenFingerprints` as resolved. */
async function autoResolveStale(kind: string, seenFingerprints: Set<string>): Promise<number> {
  const open = await db()
    .select({ id: alerts.id, fingerprint: alerts.fingerprint })
    .from(alerts)
    .where(and(eq(alerts.kind, kind), eq(alerts.status, "open")));

  const toResolve = open.filter((a) => !seenFingerprints.has(a.fingerprint));
  if (toResolve.length === 0) return 0;

  await db()
    .update(alerts)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(
      inArray(
        alerts.id,
        toResolve.map((a) => a.id),
      ),
    );
  return toResolve.length;
}

/** A network-wide (siteId IS NULL) disabled rule mutes the whole check kind. */
async function isKindGloballyDisabled(kind: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: alertRules.id })
    .from(alertRules)
    .where(and(eq(alertRules.kind, kind), eq(alertRules.enabled, false), isNull(alertRules.siteId)))
    .limit(1);
  return !!row;
}

/** Run a single check and persist its candidates. Returns per-check summary. */
export async function runCheck(check: CheckDef): Promise<{
  kind: string;
  durationMs: number;
  candidates: number;
  newAlerts: number;
  updatedAlerts: number;
  autoResolved: number;
  observed?: string;
  error?: string;
}> {
  if (await isKindGloballyDisabled(check.kind)) {
    return {
      kind: check.kind,
      durationMs: 0,
      candidates: 0,
      newAlerts: 0,
      updatedAlerts: 0,
      autoResolved: 0,
      observed: "skipped — disabled by alert rule",
    };
  }

  let result: CheckResult;
  try {
    result = await check.run();
  } catch (e) {
    return {
      kind: check.kind,
      durationMs: 0,
      candidates: 0,
      newAlerts: 0,
      updatedAlerts: 0,
      autoResolved: 0,
      error: (e as Error).message,
    };
  }

  let newAlerts = 0;
  let updatedAlerts = 0;
  const seen = new Set<string>();
  for (const c of result.candidates) {
    const { rule } = await getRuleConfig(c.kind, c.siteId);
    const verdict = await upsertCandidate(c, rule);
    if (verdict === "new") newAlerts++;
    else updatedAlerts++;
    seen.add(fingerprint(c.kind, c.siteId, c.entity));
  }
  const autoResolved = await autoResolveStale(check.kind, seen);

  return {
    kind: check.kind,
    durationMs: result.durationMs,
    candidates: result.candidates.length,
    newAlerts,
    updatedAlerts,
    autoResolved,
    observed: result.observed,
    error: result.error,
  };
}

/** Run a list of checks, persisting each one's summary on an alert_check_runs row. */
export async function runChecks(
  checks: CheckDef[],
): Promise<{
  kinds: string[];
  durationMs: number;
  perCheck: Array<Awaited<ReturnType<typeof runCheck>>>;
  hadError: boolean;
}> {
  const startedAt = new Date();
  const [runRow] = await db()
    .insert(alertCheckRuns)
    .values({
      kinds: checks.map((c) => c.kind).join(","),
      summary: {},
    })
    .returning({ id: alertCheckRuns.id });

  const perCheck = [] as Awaited<ReturnType<typeof runCheck>>[];
  for (const check of checks) {
    perCheck.push(await runCheck(check));
  }
  const finishedAt = new Date();
  const hadError = perCheck.some((s) => s.error);

  const summary = Object.fromEntries(perCheck.map((s) => [s.kind, s]));
  await db()
    .update(alertCheckRuns)
    .set({ finishedAt, hadError, summary })
    .where(eq(alertCheckRuns.id, runRow.id));

  return {
    kinds: checks.map((c) => c.kind),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    perCheck,
    hadError,
  };
}
