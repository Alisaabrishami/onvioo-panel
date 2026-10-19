import type { PayType } from "@/db/schema";
import { JALALI_MONTHS, addJalaliMonths, fromJalali, jalaliMonthDays, toJalaliParts, toPersianDigits } from "./format";

// Pure payroll and attendance maths. A period is a Jalali month written "1405-07".

export const STANDARD_MONTH_MINUTES = 176 * 60; // 44 hours a week, the labour-law full time
export const OVERTIME_FACTOR = 1.4; // overtime pays 40% more

export function periodOf(date: Date = new Date()): string {
  const p = toJalaliParts(date);
  return `${p.jy}-${String(p.jm).padStart(2, "0")}`;
}

export function parsePeriod(period: string): { jy: number; jm: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  return jm >= 1 && jm <= 12 ? { jy, jm } : null;
}

export function shiftPeriod(period: string, delta: number): string {
  const p = parsePeriod(period)!;
  const n = addJalaliMonths(p.jy, p.jm, delta);
  return `${n.jy}-${String(n.jm).padStart(2, "0")}`;
}

// [start, end) of the month as instants, Tehran midnight to Tehran midnight
export function periodRange(period: string): { start: Date; end: Date } {
  const p = parsePeriod(period)!;
  const next = addJalaliMonths(p.jy, p.jm, 1);
  return { start: fromJalali(p.jy, p.jm, 1), end: fromJalali(next.jy, next.jm, 1) };
}

export function periodLabel(period: string): string {
  const p = parsePeriod(period);
  return p ? `${JALALI_MONTHS[p.jm - 1]} ${toPersianDigits(p.jy)}` : period;
}

export function periodDays(period: string): number {
  const p = parsePeriod(period)!;
  return jalaliMonthDays(p.jy, p.jm);
}

export type Segment = { clockIn: Date; clockOut: Date | null };

// Minutes inside [start, end); an open stretch counts up to `now`
export function minutesWithin(segments: Segment[], start: Date, end: Date, now: Date = new Date()): number {
  let ms = 0;
  for (const s of segments) {
    const a = Math.max(s.clockIn.getTime(), start.getTime());
    const b = Math.min((s.clockOut ?? now).getTime(), end.getTime());
    if (b > a) ms += b - a;
  }
  return Math.round(ms / 60000);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return toPersianDigits(`${h}:${String(m).padStart(2, "0")}`);
}

export type PayInput = {
  payType: PayType;
  rate: number;
  workedMinutes: number;
  items: number;
  // Leave days that are unpaid, deducted from monthly pay
  unpaidDays?: number;
  daysInMonth?: number;
};

const roundToman = (n: number) => Math.round(n / 1000) * 1000;

// Suggested base and overtime; the admin can adjust both before paying
export function suggestPay(input: PayInput): { base: number; overtime: number; deductions: number; overtimeMinutes: number } {
  const { payType, rate, workedMinutes, items } = input;
  if (payType === "hourly") return { base: roundToman((workedMinutes / 60) * rate), overtime: 0, deductions: 0, overtimeMinutes: 0 };
  if (payType === "per_item") return { base: roundToman(items * rate), overtime: 0, deductions: 0, overtimeMinutes: 0 };
  const overtimeMinutes = Math.max(0, workedMinutes - STANDARD_MONTH_MINUTES);
  const hourly = rate / (STANDARD_MONTH_MINUTES / 60);
  const deductions = input.unpaidDays && input.daysInMonth ? roundToman((rate / input.daysInMonth) * input.unpaidDays) : 0;
  return { base: rate, overtime: roundToman((overtimeMinutes / 60) * hourly * OVERTIME_FACTOR), deductions, overtimeMinutes };
}

export function netPay(p: { base: number; overtime: number; bonus: number; deductions: number }): number {
  return Math.max(0, p.base + p.overtime + p.bonus - p.deductions);
}

// What an hour of this person costs, to price time spent on a client
export function hourlyCost(payType: PayType, rate: number): number {
  if (payType === "hourly") return rate;
  if (payType === "monthly") return rate / (STANDARD_MONTH_MINUTES / 60);
  return 0; // per-item pay is costed by items, not hours
}

// Days of a leave that fall inside the month (both ends inclusive, ISO days)
export function leaveDaysWithin(startsOn: string, endsOn: string, rangeStart: string, rangeEndExclusive: string): number {
  const from = startsOn > rangeStart ? startsOn : rangeStart;
  const lastInRange = new Date(Date.parse(`${rangeEndExclusive}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const to = endsOn < lastInRange ? endsOn : lastInRange;
  if (to < from) return 0;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

export type MemberStats = { userId: string; delivered: number; onTime: number; dueTasks: number; minutes: number };

// Team leaderboard: delivered work counts most, punctuality next, hours a little
export function teamScore(s: MemberStats): number {
  const punctuality = s.dueTasks ? s.onTime / s.dueTasks : 1;
  return Math.round(s.delivered * 10 + punctuality * 30 + Math.min(s.minutes / 60, 200) / 10);
}
