import type { ContentType } from "@/db/schema";
import { TYPE_LABELS } from "./content";
import { toPersianDigits } from "./format";
import { periodLabel } from "./payroll";

// Pure parts of the monthly client report: its shape, sums and the
// plain-language summary used when no AI key is set

export type MonthlyStats = {
  content: {
    published: number;
    byType: Partial<Record<ContentType, number>>;
    titles: string[];
    approved: number;
    revisions: number;
    inProgress: number;
  };
  shoots: number;
  instagram: {
    followersStart: number | null;
    followersEnd: number | null;
    change: number | null;
    views: number;
    reach: number;
    posts: number;
    topPosts: { caption: string; views: number; permalink: string | null }[];
  } | null;
  site: {
    projects: { title: string; status: string; done: number; total: number }[];
    milestonesDone: number;
    ticketsOpened: number;
    ticketsClosed: number;
    uptime: number | null;
  };
  billing: { invoiced: number; paid: number; outstanding: number };
};

export type MonthlySummary = { headline: string; summary: string; highlights: string[]; nextMonth: string[] };
export type MonthlyReportData = { stats: MonthlyStats; ai: boolean } & MonthlySummary;

type DayRow = { day: string; followers?: number | null; views?: number | null; reach?: number | null };

// Followers at the first and last day that has a number, plus summed views and reach
export function instagramTotals(days: DayRow[]): Pick<NonNullable<MonthlyStats["instagram"]>, "followersStart" | "followersEnd" | "change" | "views" | "reach"> {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const withFollowers = sorted.filter((d) => d.followers != null);
  const followersStart = withFollowers[0]?.followers ?? null;
  const followersEnd = withFollowers.at(-1)?.followers ?? null;
  return {
    followersStart,
    followersEnd,
    change: followersStart != null && followersEnd != null && withFollowers.length > 1 ? followersEnd - followersStart : null,
    views: sorted.reduce((s, d) => s + (d.views ?? 0), 0),
    reach: sorted.reduce((s, d) => s + (d.reach ?? 0), 0),
  };
}

// Share of successful checks, one decimal, or null with no checks
export function uptimePercent(ok: number, total: number): number | null {
  return total > 0 ? Math.round((ok / total) * 1000) / 10 : null;
}

export function countByType(types: ContentType[]): Partial<Record<ContentType, number>> {
  const out: Partial<Record<ContentType, number>> = {};
  for (const t of types) out[t] = (out[t] ?? 0) + 1;
  return out;
}

export function byTypeText(byType: Partial<Record<ContentType, number>>): string {
  return Object.entries(byType)
    .map(([t, n]) => `${toPersianDigits(n!)} ${TYPE_LABELS[t as ContentType]}`)
    .join("، ");
}

// The numbers in a prompt-friendly block
export function statsForPrompt(s: MonthlyStats): string {
  const ig = s.instagram;
  return [
    `Content published: ${s.content.published} (${Object.entries(s.content.byType).map(([t, n]) => `${t} ${n}`).join(", ") || "none"})`,
    `Published titles: ${s.content.titles.join(" | ") || "none"}`,
    `Approved by client: ${s.content.approved}; sent back for changes: ${s.content.revisions}; still in production: ${s.content.inProgress}`,
    `Shoot sessions: ${s.shoots}`,
    ig
      ? `Instagram: followers ${ig.followersStart ?? "?"} → ${ig.followersEnd ?? "?"} (change ${ig.change ?? "unknown"}); page views ${ig.views}; reach ${ig.reach}; posts ${ig.posts}; top posts: ${ig.topPosts.map((p) => `"${p.caption}" ${p.views} views`).join(" | ") || "none"}`
      : "Instagram: no data imported this month",
    s.site.projects.length
      ? `Website projects: ${s.site.projects.map((p) => `${p.title} (${p.status}, ${p.done}/${p.total} milestones)`).join("; ")}; milestones finished this month: ${s.site.milestonesDone}`
      : "Website projects: none",
    `Support tickets: ${s.site.ticketsOpened} opened, ${s.site.ticketsClosed} closed; site uptime: ${s.site.uptime != null ? `${s.site.uptime}%` : "not monitored"}`,
  ].join("\n");
}

// Used without an AI key and as the AI_DRIVER=mock answer: still a readable report
export function basicSummary(clientName: string, period: string, s: MonthlyStats): MonthlySummary {
  const month = periodLabel(period);
  const ig = s.instagram;
  const highlights: string[] = [];
  if (s.content.published) highlights.push(`${toPersianDigits(s.content.published)} محتوا منتشر شد: ${byTypeText(s.content.byType)}`);
  if (s.shoots) highlights.push(`${toPersianDigits(s.shoots)} جلسه ضبط برگزار شد`);
  if (ig?.change != null) highlights.push(ig.change >= 0 ? `${toPersianDigits(ig.change)} فالوور جدید` : `${toPersianDigits(-ig.change)} فالوور کمتر از اول ماه`);
  if (ig?.views) highlights.push(`${toPersianDigits(ig.views.toLocaleString("en-US"))} بازدید پیج`);
  if (s.site.milestonesDone) highlights.push(`${toPersianDigits(s.site.milestonesDone)} مرحله از پروژه سایت تمام شد`);
  if (s.site.uptime != null) highlights.push(`سایت ${toPersianDigits(s.site.uptime)}٪ از زمان در دسترس بود`);
  return {
    headline: s.content.published ? `${month}: ${toPersianDigits(s.content.published)} محتوا برای ${clientName}` : `گزارش ${month} ${clientName}`,
    summary: [
      `در ${month}، ${s.content.published ? `${toPersianDigits(s.content.published)} محتوا منتشر شد` : "محتوایی منتشر نشد"}`,
      s.content.approved ? ` و ${toPersianDigits(s.content.approved)} محتوا را تأیید کردید` : "",
      s.content.inProgress ? `. ${toPersianDigits(s.content.inProgress)} محتوای دیگر در حال ساخت است` : "",
      ".",
    ].join(""),
    highlights: highlights.length ? highlights : ["این ماه فعالیت ثبت‌شده‌ای نداشت"],
    nextMonth: [
      s.content.inProgress ? "تمام کردن محتواهای در حال ساخت و انتشار منظم آن‌ها" : "برنامه‌ریزی محتوای ماه بعد در اولین جلسه",
      ig ? "تکرار قالب پربازدیدترین محتوای این ماه" : "وصل کردن آمار اینستاگرام برای گزارش دقیق‌تر",
    ],
  };
}
