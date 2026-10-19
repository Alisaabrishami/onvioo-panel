import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatJalaliDate,
  formatJalaliDateTime,
  formatJalaliLong,
  formatToman,
  addJalaliMonths,
  fromJalali,
  jalaliInputValue,
  jalaliMonthDays,
  jalaliWeekday,
  parseJalali,
  toJalaliParts,
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

describe("jalali calendar helpers", () => {
  it("round-trips a Jalali date and Tehran time", () => {
    const d = fromJalali(1405, 7, 27, 14, 30);
    expect(d.toISOString()).toBe("2026-10-19T11:00:00.000Z");
    expect(toJalaliParts(d)).toEqual({ jy: 1405, jm: 7, jd: 27, hour: 14, minute: 30 });
    expect(jalaliInputValue(d)).toEqual({ date: "1405/07/27", time: "14:30" });
  });

  it("parses Persian digits and rejects impossible dates", () => {
    expect(parseJalali("۱۴۰۵/۷/۲۷", "۱۴:۳۰")?.toISOString()).toBe("2026-10-19T11:00:00.000Z");
    expect(parseJalali("1405-07-27")?.toISOString()).toBe("2026-10-18T20:30:00.000Z");
    expect(parseJalali("1405/07/31")).toBeNull();
    expect(parseJalali("1405/13/01")).toBeNull();
    expect(parseJalali("1405/07/27", "25:00")).toBeNull();
    expect(parseJalali("tomorrow")).toBeNull();
  });

  it("knows month lengths, weekdays and month arithmetic", () => {
    expect(jalaliMonthDays(1405, 1)).toBe(31);
    expect(jalaliMonthDays(1405, 7)).toBe(30);
    expect(jalaliMonthDays(1403, 12)).toBe(30); // 1403 is a leap year
    expect(jalaliMonthDays(1404, 12)).toBe(29);
    // 27 Mehr 1405 is Monday 19 October 2026; Saturday is 0
    expect(jalaliWeekday(1405, 7, 27)).toBe(2);
    expect(addJalaliMonths(1405, 12, 1)).toEqual({ jy: 1406, jm: 1 });
    expect(addJalaliMonths(1405, 1, -1)).toEqual({ jy: 1404, jm: 12 });
  });
});
