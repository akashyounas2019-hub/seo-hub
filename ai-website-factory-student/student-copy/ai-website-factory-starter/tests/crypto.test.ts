import { describe, expect, it } from "vitest";
import { decrypt, encrypt, maskApiKey } from "@/lib/crypto";

describe("crypto (AES-256-GCM, HKDF-derived keys)", () => {
  it("round-trips a string through encrypt/decrypt with default purpose", () => {
    const plaintext = "sk-ant-api03-this-is-a-fake-anthropic-key-for-testing";
    const ct = encrypt(plaintext);
    // v2 layout: aesgcm_v2.<purpose>.<iv>.<tag>.<ct>
    expect(ct.startsWith("aesgcm_v2.")).toBe(true);
    expect(ct.split(".")[1]).toBe("generic");
    expect(decrypt(ct)).toBe(plaintext);
  });

  it("derives a different key per purpose so ciphertexts are not cross-decryptable", () => {
    const a = encrypt("the-secret", "anthropic_key");
    const b = encrypt("the-secret", "smtp_password");
    // Re-tag b as if it came from purpose 'anthropic_key' — should fail to decrypt
    // because the HKDF info string differs.
    const bParts = b.split(".");
    const forged = ["aesgcm_v2", "anthropic_key", bParts[2], bParts[3], bParts[4]].join(".");
    expect(() => decrypt(forged)).toThrow();
    // But each one decrypts correctly under its own purpose.
    expect(decrypt(a)).toBe("the-secret");
    expect(decrypt(b)).toBe("the-secret");
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("throws on a bogus ciphertext payload", () => {
    expect(() => decrypt("aesgcm_v2.generic.bad.payload.here")).toThrow();
    expect(() => decrypt("not-a-real-ciphertext")).toThrow();
  });

  it("masks API keys for safe display", () => {
    expect(maskApiKey("sk-ant-api03-AAAAAAAA-XYZ12345")).toBe("sk-ant-…2345");
    expect(maskApiKey("short")).toBe("*****");
  });
});
