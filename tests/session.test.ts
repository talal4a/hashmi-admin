import { describe, expect, it } from "vitest";
import { createLocalSessionToken, verifyLocalSessionToken } from "@/lib/auth/session";

/**
 * The signed local session is what stands in for a Firebase session cookie when
 * Firebase is unconfigured, so its integrity checks matter.
 */
describe("local session token", () => {
  it("round-trips a valid token", () => {
    const token = createLocalSessionToken("adm-owner", Date.now() + 60_000);
    expect(verifyLocalSessionToken(token)).toEqual({ uid: "adm-owner" });
  });

  it("rejects a tampered payload", () => {
    const token = createLocalSessionToken("adm-owner", Date.now() + 60_000);
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ uid: "attacker", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(verifyLocalSessionToken(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = createLocalSessionToken("adm-owner", Date.now() + 60_000);
    const [body] = token.split(".");
    expect(verifyLocalSessionToken(`${body}.notavalidsignature`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createLocalSessionToken("adm-owner", Date.now() - 1000);
    expect(verifyLocalSessionToken(token)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(verifyLocalSessionToken("")).toBeNull();
    expect(verifyLocalSessionToken("garbage")).toBeNull();
    expect(verifyLocalSessionToken("a.b.c.d")).toBeNull();
  });
});
