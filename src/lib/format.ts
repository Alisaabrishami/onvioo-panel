import { toGregorian, toJalaali } from "jalaali-js";

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
