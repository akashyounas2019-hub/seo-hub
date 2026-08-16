/**
 * Minimal POSIX 5-field cron evaluator.
 *
 * Used by:
 *  - `src/scripts/run-scheduled-workflows.ts` — the runner that fires due rows
 *  - `src/app/actions/scheduled-workflows.ts` — CRUD that needs to compute
 *    next_fire_at when an operator creates / toggles a workflow
 *  - The schedule UI for "preview next 5 fires" before saving
 *
 * Supports: `*`, step (slash-N), lists `1,3,5`, ranges `1-5`, and the
 * standard `MON-SUN` / `JAN-DEC` aliases. Deliberately no external library.
 */

const DOW_ALIAS: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};
const MONTH_ALIAS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function expandField(field: string, lo: number, hi: number, alias?: Record<string, number>): Set<number> {
  const out = new Set<number>();
  const parts = field.split(",");
  for (const raw of parts) {
    const part = raw.trim();
    if (part === "" || part === "*") {
      for (let n = lo; n <= hi; n++) out.add(n);
      continue;
    }
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      if (step <= 0) throw new Error(`bad step in cron field "${field}"`);
      const rangeStr = stepMatch[1];
      const rng = parseRange(rangeStr, lo, hi, alias);
      for (let n = rng.from; n <= rng.to; n += step) out.add(n);
      continue;
    }
    if (part.includes("-")) {
      const rng = parseRange(part, lo, hi, alias);
      for (let n = rng.from; n <= rng.to; n++) out.add(n);
      continue;
    }
    out.add(parseSingle(part, alias));
  }
  for (const v of out) {
    if (v < lo || v > hi) throw new Error(`field value ${v} out of range [${lo},${hi}]`);
  }
  return out;
}

function parseSingle(s: string, alias?: Record<string, number>): number {
  const up = s.toUpperCase();
  if (alias && up in alias) return alias[up];
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) throw new Error(`bad cron token "${s}"`);
  return n;
}

function parseRange(s: string, lo: number, hi: number, alias?: Record<string, number>): { from: number; to: number } {
  if (s === "*" || s === "") return { from: lo, to: hi };
  if (!s.includes("-")) {
    const v = parseSingle(s, alias);
    return { from: v, to: hi };
  }
  const [a, b] = s.split("-", 2);
  return { from: parseSingle(a, alias), to: parseSingle(b, alias) };
}

/**
 * Compute the next firing time AFTER `from` for the given 5-field cron
 * expression, interpreted in `timezone` (IANA name, e.g. "Asia/Dubai").
 * Returns a UTC Date suitable for storing in timestamptz.
 */
export function nextCronFire(cronExpr: string, timezone: string, from: Date = new Date()): Date {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`cron must have 5 fields, got ${fields.length}: "${cronExpr}"`);
  }
  const min = expandField(fields[0], 0, 59);
  const hr = expandField(fields[1], 0, 23);
  const dom = expandField(fields[2], 1, 31);
  const mon = expandField(fields[3], 1, 12, MONTH_ALIAS);
  const dow = expandField(fields[4], 0, 6, DOW_ALIAS);

  // POSIX cron rule: if BOTH dom and dow are restricted (not full set),
  // the match is the UNION. If only one is restricted, treat the other as "*".
  const domRestricted = dom.size < 31;
  const dowRestricted = dow.size < 7;

  const start = new Date(from.getTime() + 60_000 - (from.getTime() % 60_000));
  const limit = new Date(start.getTime() + 4 * 365 * 24 * 60 * 60_000);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
    hour12: false,
  });

  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  let cursor = start;
  while (cursor < limit) {
    const parts = Object.fromEntries(fmt.formatToParts(cursor).map((p) => [p.type, p.value]));
    const M = parseInt(parts.minute, 10);
    const H = parseInt(parts.hour === "24" ? "0" : parts.hour, 10);
    const D = parseInt(parts.day, 10);
    const MO = parseInt(parts.month, 10);
    const DW = dowMap[parts.weekday] ?? -1;

    let dayOk: boolean;
    if (domRestricted && dowRestricted) {
      dayOk = dom.has(D) || dow.has(DW);
    } else if (domRestricted) {
      dayOk = dom.has(D);
    } else if (dowRestricted) {
      dayOk = dow.has(DW);
    } else {
      dayOk = true;
    }

    if (mon.has(MO) && dayOk && hr.has(H) && min.has(M)) {
      return cursor;
    }
    cursor = new Date(cursor.getTime() + 60_000);
  }
  throw new Error(`no firing time found in 4y for cron "${cronExpr}" in ${timezone}`);
}

/** Validate a cron expression — returns null on success, error string on failure. */
export function validateCron(cronExpr: string, timezone: string = "Asia/Dubai"): string | null {
  try {
    nextCronFire(cronExpr, timezone, new Date());
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Common cron presets surfaced in the UI. */
export const CRON_PRESETS: Array<{ label: string; expr: string; hint: string }> = [
  { label: "Every Monday at 9:00 AM", expr: "0 9 * * MON", hint: "weekly blog publish" },
  { label: "Every weekday at 8:00 AM", expr: "0 8 * * MON-FRI", hint: "daily morning queue" },
  { label: "Every day at 9:00 AM", expr: "0 9 * * *", hint: "daily run" },
  { label: "1st of every month at 9:00 AM", expr: "0 9 1 * *", hint: "monthly refresh sweep" },
  { label: "Every quarter (Jan 1, Apr 1, Jul 1, Oct 1)", expr: "0 9 1 1,4,7,10 *", hint: "quarterly content refresh" },
  { label: "Every Sunday at 7:00 AM", expr: "0 7 * * SUN", hint: "weekly digest" },
];
