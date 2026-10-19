import type { ContentType } from "@/db/schema";
import { jalaliToIsoDate, toLatinDigits } from "./format";

// Pure growth maths shared by the panel, the portal and the AI prompts.
// Dates are ISO day strings (YYYY-MM-DD) so they compare and sort as text.

export type DayPoint = { day: string; followers: number | null; reach?: number | null; views?: number | null };
export type PostMetrics = {
  postedAt: Date;
  type: ContentType;
  views: number | null;
  reach?: number | null;
  likes: number | null;
  comments: number | null;
  saves?: number | null;
  shares?: number | null;
};

const DAY_MS = 24 * 3600 * 1000;

export function dayIndex(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

export function addDays(day: string, n: number): string {
  return new Date((dayIndex(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

// Today's date in Tehran, as the day the stats belong to
export function tehranDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(date);
}

export function followerSeries(points: DayPoint[]): { day: string; followers: number }[] {
  return points
    .filter((p): p is DayPoint & { followers: number } => p.followers != null)
    .sort((a, b) => a.day.localeCompare(b.day));
}

// Change in followers over the last `days` days, using the nearest earlier snapshot
export function followerChange(points: DayPoint[], days: number): number | null {
  const series = followerSeries(points);
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const cutoff = addDays(last.day, -days);
  const base = [...series].reverse().find((p) => p.day <= cutoff) ?? series[0];
  if (base === last) return null;
  return last.followers - base.followers;
}

function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

export type Forecast = {
  current: number;
  lastDay: string;
  perDay: number;
  // Followers gained per extra reel in a week, learned from past weeks; null when the history can't tell
  perReel: number | null;
  reelsPerWeek: number;
  basedOnDays: number;
};

// Trend from the last 90 days of follower snapshots, plus how weekly reel
// count moved weekly growth. Needs two weeks of data to say anything.
export function buildForecast(points: DayPoint[], reelDays: string[]): Forecast | null {
  const series = followerSeries(points);
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const recent = series.filter((p) => p.day > addDays(last.day, -90));
  const span = dayIndex(last.day) - dayIndex(recent[0].day);
  if (span < 14) return null;
  const fit = linearFit(
    recent.map((p) => dayIndex(p.day)),
    recent.map((p) => p.followers),
  );
  if (!fit) return null;

  // Weekly buckets ending on the last day: gain in the week vs reels posted that week
  const weeks: { gain: number; reels: number }[] = [];
  for (let end = last.day; dayIndex(end) - 7 >= dayIndex(recent[0].day); end = addDays(end, -7)) {
    const start = addDays(end, -7);
    const at = (day: string) => [...recent].reverse().find((p) => p.day <= day);
    const a = at(start);
    const b = at(end);
    if (!a || !b || a === b) continue;
    weeks.push({ gain: b.followers - a.followers, reels: reelDays.filter((d) => d > start && d <= end).length });
  }
  const reelFit = weeks.length >= 4 ? linearFit(weeks.map((w) => w.reels), weeks.map((w) => w.gain)) : null;
  const reelsPerWeek = weeks.length ? weeks.reduce((s, w) => s + w.reels, 0) / weeks.length : 0;

  return {
    current: last.followers,
    lastDay: last.day,
    perDay: fit.slope,
    perReel: reelFit && reelFit.slope > 0 ? reelFit.slope : null,
    reelsPerWeek,
    basedOnDays: span,
  };
}

// Followers expected `days` from the last snapshot with `extraReels` more reels per week
export function project(f: Forecast, days: number, extraReels = 0): number {
  const extra = f.perReel ? (f.perReel * extraReels * days) / 7 : 0;
  return Math.max(0, Math.round(f.current + f.perDay * days + extra));
}

export function interactions(p: PostMetrics): number {
  return (p.likes ?? 0) + (p.comments ?? 0) + (p.saves ?? 0) + (p.shares ?? 0);
}

// Views when Instagram gave them, otherwise interactions (competitor pages only expose likes and comments)
export function performance(p: PostMetrics): number {
  return p.views ?? interactions(p);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Engagement as a share of reach (or views), in percent
export function engagementRate(p: PostMetrics): number | null {
  const base = p.reach ?? p.views;
  if (!base) return null;
  return (interactions(p) / base) * 100;
}

// A post doing at least `factor` times the page's median, judged against
// the page's other posts; needs a few posts to have a baseline
export function isSpike<T extends PostMetrics>(post: T, all: T[], factor = 3): { ratio: number } | null {
  const others = all.filter((p) => p !== post).map(performance).filter((v) => v > 0);
  if (others.length < 5) return null;
  const base = median(others);
  if (base <= 0) return null;
  const ratio = performance(post) / base;
  return ratio >= factor ? { ratio } : null;
}

const WEEKDAY_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

function tehranHourAndDay(date: Date): { hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  return { hour, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd) };
}

export type Slot = { label: string; avg: number; posts: number };

// Average performance by publish hour band and weekday, Tehran time, best first
export function bestSlots(posts: PostMetrics[]): { hours: Slot[]; days: Slot[] } {
  const bands = [
    { from: 6, to: 12, label: "صبح (۶ تا ۱۲)" },
    { from: 12, to: 16, label: "ظهر (۱۲ تا ۱۶)" },
    { from: 16, to: 20, label: "عصر (۱۶ تا ۲۰)" },
    { from: 20, to: 24, label: "شب (۲۰ تا ۲۴)" },
    { from: 0, to: 6, label: "نیمه‌شب (۰ تا ۶)" },
  ];
  const hourAgg = new Map<string, number[]>();
  const dayAgg = new Map<string, number[]>();
  for (const p of posts) {
    const v = performance(p);
    if (!v) continue;
    const { hour, weekday } = tehranHourAndDay(p.postedAt);
    const band = bands.find((b) => hour >= b.from && hour < b.to)!.label;
    hourAgg.set(band, [...(hourAgg.get(band) ?? []), v]);
    const day = WEEKDAY_FA[weekday];
    dayAgg.set(day, [...(dayAgg.get(day) ?? []), v]);
  }
  const toSlots = (m: Map<string, number[]>) =>
    [...m.entries()]
      .map(([label, vs]) => ({ label, avg: vs.reduce((a, b) => a + b, 0) / vs.length, posts: vs.length }))
      .sort((a, b) => b.avg - a.avg);
  return { hours: toSlots(hourAgg), days: toSlots(dayAgg) };
}

// --- CSV import ---------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t" || ch === "؛") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
  return rows;
}

// "12,345", "۱۲٬۳۴۵", "12.3K" → 12345 / 12300; blank → null; garbage → NaN
export function parseCount(text: string | undefined): number | null {
  if (text == null) return null;
  let t = toLatinDigits(text).replace(/[,٬\s]/g, "").replace("٫", ".");
  if (!t) return null;
  let mul = 1;
  if (/[kK]$/.test(t)) {
    mul = 1_000;
    t = t.slice(0, -1);
  } else if (/[mM]$/.test(t)) {
    mul = 1_000_000;
    t = t.slice(0, -1);
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * mul) : NaN;
}

// Tehran has been UTC+3:30 all year since daylight saving ended in 2022
const TEHRAN_OFFSET_MS = 3.5 * 3600 * 1000;

// Accepts 2026-10-19, 2026/10/19, a Jalali date like ۱۴۰۵/۰۷/۲۷, or Meta
// Business Suite's 10/19/2026 14:30; a time of day, when present, is Tehran time
export function parseDateTime(text: string): { day: string; at: Date | null } | null {
  const t = toLatinDigits(text.trim());
  // Excel stores dates as days since 1899-12-30 when a cell is date-formatted
  if (/^\d{5}(\.\d+)?$/.test(t) && Number(t) > 20000 && Number(t) < 80000) {
    const ms = Math.round((Number(t) - 25569) * 86400000);
    return { day: new Date(ms).toISOString().slice(0, 10), at: null };
  }
  const time = /(\d{1,2}):(\d{2})/.exec(t.replace(/^\S+/, ""));
  const datePart = t.split(/[ T]/)[0];
  let day: string | null = null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(datePart);
  if (us) {
    day = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    if (Number.isNaN(Date.parse(day))) return null;
  } else {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(datePart);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 1600) day = jalaliToIsoDate(`${y}/${mo}/${d}`);
    else {
      day = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (Number.isNaN(Date.parse(day))) return null;
    }
  }
  if (!day) return null;
  const at = time ? new Date(Date.parse(`${day}T${time[1].padStart(2, "0")}:${time[2]}:00Z`) - TEHRAN_OFFSET_MS) : null;
  return { day, at };
}

export function parseDay(text: string): string | null {
  return parseDateTime(text)?.day ?? null;
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "day", "publish time", "تاریخ", "روز"],
  followers: ["followers", "فالوور", "فالوورها", "دنبال‌کننده"],
  reach: ["reach", "ریچ", "دسترسی"],
  views: ["views", "impressions", "plays", "ویو", "بازدید"],
  id: ["post id", "media id"],
  link: ["link", "permalink", "url", "لینک"],
  type: ["post type", "type", "نوع"],
  likes: ["likes", "لایک"],
  comments: ["comments", "کامنت", "نظر"],
  saves: ["saves", "saved", "سیو", "ذخیره"],
  shares: ["shares", "اشتراک", "شیر"],
  caption: ["caption", "description", "کپشن", "متن"],
};

export function mapHeader(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      // Exports name columns loosely ("Instagram followers", "Publish time"), so longer aliases match anywhere
      const hit = aliases.some((a) => key === a || key.startsWith(a) || (a.length >= 4 && key.includes(a)));
      if (map[field] === undefined && hit) map[field] = i;
    }
  });
  return map;
}

const TYPE_WORDS: Record<string, ContentType> = {
  reel: "reel",
  reels: "reel",
  ریلز: "reel",
  story: "story",
  استوری: "story",
  carousel: "carousel",
  album: "carousel",
  اسلاید: "carousel",
  video: "video",
  ویدیو: "video",
  post: "post",
  image: "post",
  پست: "post",
};

export function parseType(text: string | undefined): ContentType {
  // Business Suite writes "IG reel", "IG carousel"…
  return TYPE_WORDS[(text ?? "").trim().toLowerCase().replace(/^ig\s+/, "")] ?? "post";
}
