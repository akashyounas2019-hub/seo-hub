import { createHmac, timingSafeEqual } from "node:crypto";

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
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
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
  if (expected.length !== signature.length) return { ok: false, reason: "bad-length" };

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "mismatch" };
}
