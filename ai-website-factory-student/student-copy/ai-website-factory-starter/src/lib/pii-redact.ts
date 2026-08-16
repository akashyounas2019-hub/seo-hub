/**
 * PII redaction for free-form text we persist to the database — primarily
 * chat transcripts and AI conversation logs.
 *
 * The voice booking AI legitimately needs phone numbers (we collect them as
 * customer_phone), so we don't redact those. We DO redact:
 *
 *   - Full credit card numbers (Luhn-verified to avoid stripping flight
 *     numbers or order IDs that happen to be 13–19 digits).
 *   - North-American social insurance numbers (3-3-3 pattern).
 *   - Strings that look like access tokens (sk-…, pk_…, Bearer …).
 *
 * Replacement is always a short marker like `[REDACTED:cc]` so the audit
 * trail still shows that something WAS there — the assistant or admin can
 * still understand the flow without seeing the sensitive value.
 *
 * This is defense-in-depth, NOT a guarantee. The right behavior is to never
 * accept this kind of data in the first place; the redactor catches the
 * occasional customer who pastes it anyway.
 */

const CC_LIKE = /\b(?:\d[ -]?){12,18}\d\b/g;
const SIN_LIKE = /\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/g;
const TOKEN_LIKE = /\b(?:sk|pk)[-_][a-zA-Z0-9_-]{20,}\b/g;
const BEARER_LIKE = /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi;

function luhnValid(digits: string): boolean {
  // Strip spaces / dashes.
  const d = digits.replace(/[\s-]/g, "");
  if (d.length < 13 || d.length > 19) return false;
  if (!/^\d+$/.test(d)) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Apply all redactions to a free-form string. Idempotent — calling twice
 * returns the same result.
 */
export function redactPii(input: string): string {
  if (!input) return input;
  let out = input;

  // Credit cards: only redact if Luhn-valid. Avoids stripping flight
  // numbers like "AC1242345678" or order IDs.
  out = out.replace(CC_LIKE, (match) =>
    luhnValid(match) ? "[REDACTED:cc]" : match,
  );

  out = out.replace(SIN_LIKE, "[REDACTED:sin]");
  out = out.replace(TOKEN_LIKE, "[REDACTED:token]");
  out = out.replace(BEARER_LIKE, "[REDACTED:bearer]");

  return out;
}

/**
 * Walk a chat-transcript entry (with role/content + optional tool fields)
 * and redact every string within. Mutates a new copy — the original is left
 * untouched.
 */
export function redactTranscriptEntry<T extends Record<string, unknown>>(entry: T): T {
  const next: Record<string, unknown> = { ...entry };
  for (const [k, v] of Object.entries(next)) {
    if (typeof v === "string") {
      next[k] = redactPii(v);
    }
  }
  return next as T;
}

/**
 * Truncate a transcript to a max byte budget by dropping the OLDEST turns
 * first. The assistant relies on session history; we'd rather lose the
 * earliest "hello" than the most recent "submit yes". Returns the kept
 * tail in original order.
 *
 * `maxBytes` is approximate (JSON-encoded character count).
 */
export function capTranscript<T extends Record<string, unknown>>(
  entries: T[],
  maxBytes = 32_000,
): T[] {
  if (entries.length === 0) return entries;
  let totalSize = JSON.stringify(entries).length;
  if (totalSize <= maxBytes) return entries;
  // Drop from the front until under budget. Keep at least the last 4 turns
  // so the AI still has context.
  const minKeep = 4;
  let cursor = 0;
  while (cursor < entries.length - minKeep) {
    const removed = JSON.stringify(entries[cursor]).length + 1; // +1 for comma
    totalSize -= removed;
    cursor++;
    if (totalSize <= maxBytes) break;
  }
  return entries.slice(cursor);
}
