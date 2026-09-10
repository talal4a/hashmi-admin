import { beforeEach, describe, expect, it } from "vitest";
import { clientKey, rateLimit, resetRateLimits } from "@/lib/auth/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests up to the limit and blocks the next one", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000).allowed, `request ${i + 1}`).toBe(true);
    }
    const blocked = rateLimit("k", 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts down the remaining allowance", () => {
    expect(rateLimit("k", 3, 60_000).remaining).toBe(2);
    expect(rateLimit("k", 3, 60_000).remaining).toBe(1);
    expect(rateLimit("k", 3, 60_000).remaining).toBe(0);
  });

  it("keeps separate buckets per key", () => {
    rateLimit("a", 1, 60_000);
    expect(rateLimit("a", 1, 60_000).allowed).toBe(false);
    expect(rateLimit("b", 1, 60_000).allowed).toBe(true);
  });

  it("lets the window expire", async () => {
    expect(rateLimit("k", 1, 20).allowed).toBe(true);
    expect(rateLimit("k", 1, 20).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(rateLimit("k", 1, 20).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the first forwarded address", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" },
    });
    expect(clientKey(request, "login")).toBe("login:203.0.113.5");
  });

  it("falls back to a stable placeholder when no address is present", () => {
    expect(clientKey(new Request("https://example.test"), "login")).toBe("login:unknown");
  });
});
