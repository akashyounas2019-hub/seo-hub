import { describe, expect, it } from "vitest";
import { sign, verify } from "@/lib/hmac";

const secret = "test-secret-not-real";

describe("HMAC sign/verify", () => {
  it("verifies a freshly signed payload", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ kind: "lead.captured", payload: { name: "Alice" } });
    const signature = sign({ secret, timestamp, body });
    const result = verify({ secret, timestamp, body, signature });
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ amount: 100 });
    const signature = sign({ secret, timestamp, body });
    const tampered = body.replace("100", "10000");
    const result = verify({ secret, timestamp, body: tampered, signature });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("mismatch");
  });

  it("rejects a stale timestamp (>5min in past)", () => {
    const tenMinAgo = String(Math.floor(Date.now() / 1000) - 600);
    const body = "{}";
    const signature = sign({ secret, timestamp: tenMinAgo, body });
    const result = verify({ secret, timestamp: tenMinAgo, body, signature });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("stale");
  });

  it("rejects a future timestamp (>5min ahead)", () => {
    const futureTs = String(Math.floor(Date.now() / 1000) + 600);
    const body = "{}";
    const signature = sign({ secret, timestamp: futureTs, body });
    const result = verify({ secret, timestamp: futureTs, body, signature });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("future");
  });

  // Vector test that mirrors the PHP implementation in the WP plugin.
  // If this fails, the WP plugin and platform won't agree on signatures.
  it("matches the WP plugin's PHP hash_hmac output (golden vector)", () => {
    const fixed = {
      secret: "test-secret-fixed",
      timestamp: "1700000000",
      body: '{"kind":"lead.captured","site_slug":"test","payload":{"form":"x"}}',
    };
    const sig = sign(fixed);
    // Pre-computed against `hash_hmac('sha256', $ts . '.' . $body, $secret)` in PHP 8.3.
    // Update this vector if the canonicalization scheme ever changes (it shouldn't).
    expect(sig).toBe(
      "81d2bdabd76dadf946bbb7674039bc2c77bd136f1d67ec0ec69f58e26f349493",
    );
  });
});
