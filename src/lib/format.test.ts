import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatJalaliDate,
  formatJalaliDateTime,
  formatJalaliLong,
  formatToman,
  normalizePhone,
  startOfJalaliMonth,
  toLatinDigits,
  toPersianDigits,
} from "./format";

describe("digits", () => {
  it("converts both ways", () => {
    expect(toPersianDigits(1405)).toBe("۱۴۰۵");
    expect(toLatinDigits("۰۹۱۲٣٤٥")).toBe("0912345");
  });
});

describe("normalizePhone", () => {
  it.each([
    ["09121234567", "09121234567"],
    ["9121234567", "09121234567"],
    ["+989121234567", "09121234567"],
    ["00989121234567", "09121234567"],
    ["۰۹۱۲ ۱۲۳ ۴۵۶۷", "09121234567"],
    ["0912-123-4567", "09121234567"],
  ])("accepts %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "0212345678", "0912123456", "091212345678", "abc"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("jalali dates (Tehran time)", () => {
  // 2026-10-18 21:42 UTC is 1405/07/27 01:12 in Tehran, already the next day
  const date = new Date("2026-10-18T21:42:00Z");

  it("formats in Tehran time", () => {
    expect(formatJalaliDate(date)).toBe("۱۴۰۵/۰۷/۲۷");
    expect(formatJalaliDateTime(date)).toBe("۱۴۰۵/۰۷/۲۷ ۰۱:۱۲");
    expect(formatJalaliLong(date)).toBe("۲۷ مهر ۱۴۰۵");
  });

  it("finds the start of the Jalali month at Tehran midnight", () => {
    // 1 Mehr 1405 = 2026-09-23; midnight Tehran = 20:30 UTC the day before
    expect(startOfJalaliMonth(date).toISOString()).toBe("2026-09-22T20:30:00.000Z");
  });
});

describe("amounts", () => {
  it("formats toman and sizes", () => {
    expect(formatToman(12500000)).toBe("۱۲٬۵۰۰٬۰۰۰ تومان");
    expect(formatBytes(512)).toBe("۵۱۲ بایت");
    expect(formatBytes(1536 * 1024)).toBe("۱.۵ مگابایت");
  });
});
