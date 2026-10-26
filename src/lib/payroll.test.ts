import { describe, expect, it } from "vitest";
import { hourlyCost, leaveDaysWithin, minutesWithin, netPay, periodOf, periodRange, shiftPeriod, suggestPay, teamScore } from "./payroll";

describe("periods", () => {
  it("names and bounds Jalali months in Tehran time", () => {
    expect(periodOf(new Date("2026-10-19T12:00:00Z"))).toBe("1405-07");
    const { start, end } = periodRange("1405-07");
    expect(start.toISOString()).toBe("2026-09-22T20:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-22T20:30:00.000Z");
    expect(shiftPeriod("1405-12", 1)).toBe("1406-01");
    expect(shiftPeriod("1405-01", -1)).toBe("1404-12");
  });
});

describe("attendance", () => {
  it("clips stretches to the period and counts open ones to now", () => {
    const start = new Date("2026-10-01T00:00:00Z");
    const end = new Date("2026-11-01T00:00:00Z");
    const segs = [
      { clockIn: new Date("2026-09-30T23:00:00Z"), clockOut: new Date("2026-10-01T02:00:00Z") },
      { clockIn: new Date("2026-10-05T08:00:00Z"), clockOut: new Date("2026-10-05T16:30:00Z") },
      { clockIn: new Date("2026-10-06T08:00:00Z"), clockOut: null },
    ];
    expect(minutesWithin(segs, start, end, new Date("2026-10-06T09:00:00Z"))).toBe(120 + 510 + 60);
  });
  it("counts leave days inside a month", () => {
    expect(leaveDaysWithin("2026-10-20", "2026-10-25", "2026-09-23", "2026-10-23")).toBe(3);
    expect(leaveDaysWithin("2026-11-01", "2026-11-02", "2026-09-23", "2026-10-23")).toBe(0);
  });
});

describe("pay", () => {
  it("pays hourly and per-item staff by work done", () => {
    expect(suggestPay({ payType: "hourly", rate: 150_000, workedMinutes: 90, items: 0 }).base).toBe(225_000);
    expect(suggestPay({ payType: "per_item", rate: 400_000, workedMinutes: 0, items: 7 }).base).toBe(2_800_000);
  });
  it("adds overtime past 176 hours and deducts unpaid leave for monthly staff", () => {
    const p = suggestPay({ payType: "monthly", rate: 17_600_000, workedMinutes: 186 * 60, items: 0, unpaidDays: 3, daysInMonth: 30 });
    expect(p.overtimeMinutes).toBe(600);
    expect(p.overtime).toBe(1_400_000); // 10h × 100,000 × 1.4
    expect(p.deductions).toBe(1_760_000);
    expect(netPay({ base: p.base, overtime: p.overtime, bonus: 500_000, deductions: p.deductions })).toBe(17_740_000);
  });
  it("costs an hour of time", () => {
    expect(hourlyCost("monthly", 17_600_000)).toBe(100_000);
    expect(hourlyCost("per_item", 1)).toBe(0);
  });
  it("ranks delivery above hours", () => {
    expect(teamScore({ userId: "a", delivered: 5, onTime: 4, dueTasks: 5, minutes: 0 })).toBeGreaterThan(
      teamScore({ userId: "b", delivered: 1, onTime: 1, dueTasks: 1, minutes: 200 * 60 }),
    );
  });
});
