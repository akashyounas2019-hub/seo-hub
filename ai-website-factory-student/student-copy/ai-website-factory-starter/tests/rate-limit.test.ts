import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetRateLimitForTests,
  checkLoginRate,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/rate-limit";

describe("login rate-limit (token bucket)", () => {
  beforeEach(() => _resetRateLimitForTests());

  it("permits attempts up to the per-pair limit, then blocks", () => {
    const email = "victim@example.com";
    const ip = "10.0.0.1";
    // 8 attempts permitted
    for (let i = 0; i < 8; i++) {
      expect(checkLoginRate(email, ip).ok).toBe(true);
      recordLoginFailure(email, ip);
    }
    // 9th attempt should be blocked
    const blocked = checkLoginRate(email, ip);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("too-many-for-account");
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("blocks at the IP level when many emails are tried from same IP", () => {
    const ip = "10.0.0.2";
    // 30 attempts across 30 different emails — should hit the IP-level ceiling
    for (let i = 0; i < 30; i++) {
      expect(checkLoginRate(`spray${i}@x.com`, ip).ok).toBe(true);
      recordLoginFailure(`spray${i}@x.com`, ip);
    }
    const blocked = checkLoginRate("yet-another@x.com", ip);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("too-many-from-ip");
  });

  it("recordLoginSuccess clears the per-pair counter", () => {
    const email = "user@example.com";
    const ip = "10.0.0.3";
    for (let i = 0; i < 7; i++) recordLoginFailure(email, ip);
    // Still permitted (7 < 8)
    expect(checkLoginRate(email, ip).ok).toBe(true);
    recordLoginSuccess(email, ip);
    // Now we should have a fresh window — 8 more failures should not block before the 9th
    for (let i = 0; i < 8; i++) {
      expect(checkLoginRate(email, ip).ok).toBe(true);
      recordLoginFailure(email, ip);
    }
    expect(checkLoginRate(email, ip).ok).toBe(false);
  });

  it("different IPs from same email are tracked separately", () => {
    const email = "user@example.com";
    // Exhaust ip-1
    for (let i = 0; i < 8; i++) recordLoginFailure(email, "10.0.0.4");
    expect(checkLoginRate(email, "10.0.0.4").ok).toBe(false);
    // Same email from a fresh IP should still be permitted
    expect(checkLoginRate(email, "10.0.0.5").ok).toBe(true);
  });

  it("null IP is bucketed as 'unknown' and still throttles", () => {
    const email = "user@example.com";
    for (let i = 0; i < 8; i++) recordLoginFailure(email, null);
    expect(checkLoginRate(email, null).ok).toBe(false);
  });
});
