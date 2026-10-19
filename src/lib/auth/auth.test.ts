import { describe, expect, it } from "vitest";
import { canAccess, homeFor } from "./roles";
import { generateOtpCode, generateSessionToken, hashOtp, hashToken, safeEqualHex } from "./tokens";

describe("tokens", () => {
  it("creates unguessable session tokens and stores only their hash", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });

  it("creates 6-digit codes bound to a phone number", () => {
    for (let i = 0; i < 50; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
    expect(hashOtp("09121234567", "123456")).not.toBe(hashOtp("09129999999", "123456"));
  });

  it("compares hashes safely", () => {
    const h = hashOtp("09121234567", "123456");
    expect(safeEqualHex(h, hashOtp("09121234567", "123456"))).toBe(true);
    expect(safeEqualHex(h, hashOtp("09121234567", "654321"))).toBe(false);
    expect(safeEqualHex(h, "abcd")).toBe(false);
  });
});

describe("roles", () => {
  it("sends each role to its home", () => {
    expect(homeFor("admin")).toBe("/dashboard");
    expect(homeFor("staff")).toBe("/dashboard");
    expect(homeFor("client")).toBe("/portal");
  });

  it("checks access", () => {
    expect(canAccess("staff", ["admin"])).toBe(false);
    expect(canAccess("admin", ["admin", "staff"])).toBe(true);
    expect(canAccess("client", ["admin", "staff"])).toBe(false);
  });
});
