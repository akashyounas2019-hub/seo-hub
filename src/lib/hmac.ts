export const SIGNATURE_HEADER = "x-gyl-signature";
export const KEY_ID_HEADER = "x-gyl-key-id";
export const TIMESTAMP_HEADER = "x-gyl-timestamp";
export const IDEMPOTENCY_HEADER = "x-gyl-idempotency-key";

const MAX_SKEW_SECONDS = 300;

export function sign({
  secret,
  timestamp,
  body,
}: {
  secret: string;
  timestamp: string;
  body: string;
}): string {
  if (typeof window !== "undefined") return "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require("node:crypto");
    return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  } catch {
    return "";
  }
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "stale" | "future" | "mismatch" | "bad-length" };

export function verify({
  secret,
  timestamp,
  body,
  signature,
  now = Math.floor(Date.now() / 1000),
}: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  now?: number;
}): VerifyResult {
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: "stale" };
  if (now - ts > MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  if (ts - now > MAX_SKEW_SECONDS) return { ok: false, reason: "future" };

  const expected = sign({ secret, timestamp, body });
  if (!expected || expected.length !== signature.length) return { ok: false, reason: "bad-length" };

  const encoder = new TextEncoder();
  const a = encoder.encode(expected);
  const b = encoder.encode(signature);
  if (a.length !== b.length) return { ok: false, reason: "bad-length" };
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0 ? { ok: true } : { ok: false, reason: "mismatch" };
}
