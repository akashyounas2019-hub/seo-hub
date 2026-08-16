import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for at-rest secrets (e.g. the org's Anthropic API key,
 * OAuth refresh tokens, SMTP password).
 *
 * Key derivation: HKDF-SHA256 from SESSION_SECRET with a fixed salt and a
 * per-purpose info string. This gives us:
 *   - secret-purpose separation (different `purpose` values yield different keys,
 *     so a future leak of one purpose's plaintext doesn't compromise others);
 *   - safe rotation (changing the salt invalidates all existing ciphertext);
 *   - constant-time computation, no extra deps.
 *
 * Format: `aesgcm_v1.<purpose>.<iv-base64url>.<tag-base64url>.<ct-base64url>`
 *
 * Legacy payloads written before HKDF was added are decoded transparently:
 *   - `aesgcm_v1.<iv>.<tag>.<ct>` (4 parts) → SHA-256 derived key (v1-legacy)
 *   - `aesgcm.v1.<iv>.<tag>.<ct>`  (5 parts, scheme split on '.') → same key
 *
 * Once all ciphertext has been re-encrypted with the v2 layout, the legacy
 * decoder can be removed (see `decrypt` body).
 */

const SCHEME_V2 = "aesgcm_v2"; // HKDF-derived, per-purpose
const SCHEME_V1 = "aesgcm_v1"; // legacy: SHA-256 of SESSION_SECRET (no purpose)
const HKDF_SALT = "gyl-aesgcm-v2-salt"; // change to invalidate every ciphertext on next rotation

export type EncryptPurpose =
  | "anthropic_key"
  | "gemini_key"
  | "groq_key"
  | "stripe_secret"
  | "square_secret"
  | "google_secret"
  | "twilio_token"
  | "smtp_password"
  | "telegram_bot_token"
  | "pagespeed_key"
  | "google_crux_key"
  | "integration_access_token"
  | "integration_refresh_token"
  | "generic";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 chars long for encryption");
  }
  return secret;
}

function deriveKeyV2(purpose: EncryptPurpose): Buffer {
  const secret = getSecret();
  // HKDF: input = SESSION_SECRET; salt = static; info = purpose-tag.
  const out = hkdfSync("sha256", secret, HKDF_SALT, `gyl/${purpose}/v2`, 32);
  return Buffer.from(out);
}

function deriveKeyV1Legacy(): Buffer {
  const secret = getSecret();
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string, purpose: EncryptPurpose = "generic"): string {
  const key = deriveKeyV2(purpose);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SCHEME_V2, purpose, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");

  // v2: aesgcm_v2.<purpose>.<iv>.<tag>.<ct>  (5 parts, scheme = parts[0])
  if (parts.length === 5 && parts[0] === SCHEME_V2) {
    const purpose = parts[1] as EncryptPurpose;
    return decryptParts(deriveKeyV2(purpose), parts[2], parts[3], parts[4]);
  }

  // v1 legacy variant A: aesgcm_v1.<iv>.<tag>.<ct>  (4 parts)
  if (parts.length === 4 && parts[0] === SCHEME_V1) {
    return decryptParts(deriveKeyV1Legacy(), parts[1], parts[2], parts[3]);
  }

  // v1 legacy variant B (very old): aesgcm.v1.<iv>.<tag>.<ct>  (5 parts, scheme split on '.')
  if (parts.length === 5 && parts[0] === "aesgcm" && parts[1] === "v1") {
    if (process.env.NODE_ENV !== "test") {
      // One-time warning per decryption so operators know when this branch
      // becomes safe to remove. Don't log the ciphertext itself.
      console.warn("[crypto] decoding legacy aesgcm.v1 payload — re-save the underlying secret to migrate to v2");
    }
    return decryptParts(deriveKeyV1Legacy(), parts[2], parts[3], parts[4]);
  }

  throw new Error(`unknown ciphertext scheme: ${parts[0]}`);
}

function decryptParts(key: Buffer, ivB64: string, tagB64: string, ctB64: string): string {
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Last-4 display preview for stored API keys without revealing the secret. */
export function maskApiKey(key: string): string {
  if (key.length <= 12) return "*".repeat(key.length);
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
