import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

// Users type Persian or Arabic-Indic digits from their keyboards; store Latin
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

// Returns 09xxxxxxxxx, or null when the input is not an Iranian mobile number
export function normalizePhone(input: string): string | null {
  const digits = toLatinDigits(input).replace(/[\s\-()]/g, "");
  const match = digits.match(/^(?:\+98|0098|98|0)?(9\d{9})$/);
  return match ? `0${match[1]}` : null;
}

// Iran observes no DST since 2022, so a fixed +03:30 offset is exact
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

function tehranParts(date: Date) {
  const shifted = new Date(date.getTime() + TEHRAN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export const JALALI_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export type JalaliParts = { jy: number; jm: number; jd: number; hour: number; minute: number };

export function toJalaliParts(date: Date): JalaliParts {
  const p = tehranParts(date);
  const j = toJalaali(p.year, p.month, p.day);
  return { jy: j.jy, jm: j.jm, jd: j.jd, hour: p.hour, minute: p.minute };
}

// A Jalali date and Tehran wall-clock time as an absolute instant
export function fromJalali(jy: number, jm: number, jd: number, hour = 0, minute = 0): Date {
  const g = toGregorian(jy, jm, jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, hour, minute) - TEHRAN_OFFSET_MS);
}

export function jalaliMonthDays(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

// 0 = Saturday, the first day of the Iranian week
export function jalaliWeekday(jy: number, jm: number, jd: number): number {
  const g = toGregorian(jy, jm, jd);
  return (new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay() + 1) % 7;
}

export function addJalaliMonths(jy: number, jm: number, delta: number): { jy: number; jm: number } {
  const index = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(index / 12), jm: (index % 12) + 1 };
}

// Accepts "1405/07/27" or "۱۴۰۵-۷-۲۷" and an optional "14:30"
export function parseJalali(dateText: string, timeText = ""): Date | null {
  const d = toLatinDigits(dateText).trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!d) return null;
  const [jy, jm, jd] = d.slice(1).map(Number);
  if (jm < 1 || jm > 12 || jd < 1 || jd > jalaaliMonthLength(jy, jm)) return null;
  const t = toLatinDigits(timeText).trim();
  if (!t) return fromJalali(jy, jm, jd);
  const tm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) return null;
  return fromJalali(jy, jm, jd, Number(tm[1]), Number(tm[2]));
}

export function jalaliInputValue(date: Date | null | undefined): { date: string; time: string } {
  if (!date) return { date: "", time: "" };
  const p = toJalaliParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.jy}/${pad(p.jm)}/${pad(p.jd)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function formatTime(date: Date): string {
  const p = tehranParts(date);
  return toPersianDigits(`${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`);
}

// Start of the current Jalali month, at midnight Tehran time
export function startOfJalaliMonth(now: Date = new Date()): Date {
  const p = tehranParts(now);
  const j = toJalaali(p.year, p.month, p.day);
  const g = toGregorian(j.jy, j.jm, 1);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd) - TEHRAN_OFFSET_MS);
}

export function formatJalaliDate(date: Date): string {
  const p = tehranParts(date);
  const j = toJalaali(p.year, p.month, p.day);
  return toPersianDigits(
    `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`,
  );
}

export function formatJalaliLong(date: Date): string {
  const p = tehranParts(date);
  const j = toJalaali(p.year, p.month, p.day);
  return `${toPersianDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${toPersianDigits(j.jy)}`;
}

export function formatJalaliDateTime(date: Date): string {
  const p = tehranParts(date);
  const time = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  return `${formatJalaliDate(date)} ${toPersianDigits(time)}`;
}

export function formatToman(amount: number): string {
  return `${toPersianDigits(amount.toLocaleString("en-US").replace(/,/g, "٬"))} تومان`;
}

export function formatBytes(bytes: number): string {
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${toPersianDigits(rounded)} ${units[unit]}`;
}

// Calendar dates without a time (contract terms, project deadlines) are stored
// as Gregorian "YYYY-MM-DD" strings in date columns
export function jalaliToIsoDate(text: string): string | null {
  const d = parseJalali(text);
  if (!d) return null;
  const p = tehranParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function isoDateToJalali(iso: string | null | undefined): string {
  if (!iso) return "";
  const [gy, gm, gd] = iso.split("-").map(Number);
  const j = toJalaali(gy, gm, gd);
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
}

export function formatIsoDate(iso: string | null | undefined): string {
  return iso ? toPersianDigits(isoDateToJalali(iso)) : "";
}
