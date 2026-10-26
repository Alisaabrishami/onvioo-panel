import { describe, expect, it } from "vitest";
import * as z from "zod";
import { describeAgent } from "./devices";
import { OpsError, opsFormState, parseInput, persianIssue } from "./ops/errors";

describe("describeAgent", () => {
  it("names browser and system", () => {
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe("Chrome روی Windows");
    expect(describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari روی iPhone");
    expect(describeAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Edge روی Windows");
    expect(describeAgent("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Firefox روی Linux");
  });

  it("recognises app HTTP clients", () => {
    expect(describeAgent("okhttp/4.12.0")).toBe("اپ");
    expect(describeAgent("Dart/3.5 (dart:io)")).toBe("اپ");
  });

  it("returns null without a user agent", () => {
    expect(describeAgent(null)).toBeNull();
    expect(describeAgent("")).toBeNull();
    expect(describeAgent("curl/8.5")).toBeNull();
  });
});

describe("shared input errors", () => {
  const shape = z.object({ title: z.string().min(3, { error: "عنوان را بنویسید" }), amount: z.number().optional() });

  it("keeps Persian messages and names the field", () => {
    try {
      parseInput(shape, { title: "ab" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OpsError);
      expect((error as OpsError).message).toBe("عنوان را بنویسید");
      expect((error as OpsError).field).toBe("title");
      expect((error as OpsError).status).toBe(422);
    }
  });

  it("replaces zod's English messages", () => {
    const missing = shape.safeParse({});
    expect(persianIssue(missing.error?.issues[0])).toBe("title لازم است");
    const wrong = shape.safeParse({ title: "abcd", amount: "x" });
    expect(persianIssue(wrong.error?.issues[0])).toBe("amount معتبر نیست");
  });

  it("turns an OpsError into form state and rethrows anything else", () => {
    expect(opsFormState(new OpsError("invalid", "کد اشتباه است", 422, "code"), { a: "1" })).toEqual({ errors: { code: ["کد اشتباه است"] }, values: { a: "1" } });
    expect(opsFormState(new OpsError("conflict", "فقط پیش‌نویس", 409))).toEqual({ message: "فقط پیش‌نویس", values: undefined });
    expect(() => opsFormState(new Error("boom"))).toThrow("boom");
  });
});
