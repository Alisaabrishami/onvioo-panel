import type { CheckinState } from "@/db/schema";
import { formatJalaliDate, toPersianDigits } from "./format";
import { dayIndex, tehranDay } from "./growth";

// Pure rules of the assistant's task follow-ups: when to ask the assignee,
// and the text of the questions and of the manager's digest

export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 19;
// The manager hears about a task once this many questions go unanswered
export const ESCALATE_AFTER = 2;
export const FOLLOW_UP_EVERY = { 1: "هر روز", 2: "هر ۲ روز", 3: "هر ۳ روز" } as const;

export const CHECKIN_LABELS: Record<CheckinState, string> = {
  asked: "منتظر جواب",
  on_track: "در حال انجام",
  blocked: "گیر کرده",
};

export const ANSWER_EMOJI = { done: "✅", on_track: "⏳", blocked: "🙋" } as const;
export const ANSWER_LABELS = { done: "انجام شد", on_track: "در حال انجامم", blocked: "گیر کرده‌ام" } as const;

export type AskReason = "overdue" | "due_today" | "due_tomorrow" | "checkin";

export type FollowedTask = {
  title: string;
  dueAt: Date | null;
  createdAt: Date;
  followUpEvery: number;
  askedAt: Date | null;
  answeredAt: Date | null;
};

function tehranHourAndWeekday(now: Date): { hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
  };
}

// Questions only go out in working hours, and never on Friday
export function inWorkingHours(now: Date): boolean {
  const { hour, weekday } = tehranHourAndWeekday(now);
  return weekday !== "Fri" && hour >= WORK_START_HOUR && hour < WORK_END_HOUR;
}

function daysBetween(from: Date, to: Date): number {
  return dayIndex(tehranDay(to)) - dayIndex(tehranDay(from));
}

// Why the assistant should ask about this task now, or null. At most one
// question a day; near and after the deadline it asks every day, otherwise
// every followUpEvery days since the last question or answer.
export function askReason(task: FollowedTask, now: Date): AskReason | null {
  if (task.askedAt && daysBetween(task.askedAt, now) < 1) return null;
  if (task.answeredAt && daysBetween(task.answeredAt, now) < 1) return null;
  if (task.dueAt) {
    const left = daysBetween(now, task.dueAt);
    if (task.dueAt < now) return "overdue";
    if (left === 0) return "due_today";
    if (left === 1) return "due_tomorrow";
  }
  const last = [task.askedAt, task.answeredAt, task.createdAt].filter((d): d is Date => !!d).reduce((a, b) => (a > b ? a : b));
  return daysBetween(last, now) >= Math.max(1, task.followUpEvery) ? "checkin" : null;
}

const REASON_LINES: Record<AskReason, string> = {
  overdue: "⚠️ مهلتش گذشته است",
  due_today: "⏰ مهلتش امروز است",
  due_tomorrow: "⏰ مهلتش فرداست",
  checkin: "",
};

// The question to one assignee about their followed tasks, numbered so the buttons can match
export function questionText(managerName: string, items: { title: string; dueAt: Date | null; reason: AskReason }[]): string {
  const lines = items.map((t, i) => {
    const note = REASON_LINES[t.reason] || (t.dueAt ? `مهلت ${formatJalaliDate(t.dueAt)}` : "");
    return `${toPersianDigits(i + 1)}. ${t.title}${note ? ` · ${note}` : ""}`;
  });
  return [
    `👋 سلام! از طرف ${managerName} پیگیر این ${items.length > 1 ? "کارها" : "کار"} هستم:`,
    ...lines,
    "",
    `با دکمه‌های هر شماره بگویید: ${ANSWER_EMOJI.done} ${ANSWER_LABELS.done} · ${ANSWER_EMOJI.on_track} ${ANSWER_LABELS.on_track} · ${ANSWER_EMOJI.blocked} ${ANSWER_LABELS.blocked}`,
    "اگر گیر کرده‌اید، بعدش بنویسید چه چیزی لازم دارید تا به مدیر بگویم.",
  ].join("\n");
}

export type DigestTask = {
  title: string;
  assignee: string | null;
  dueAt: Date | null;
  status: "todo" | "doing" | "done";
  checkin: CheckinState | null;
  checkinNote: string | null;
  unanswered: number;
  completedAt: Date | null;
};

export type DigestGroups<T extends DigestTask = DigestTask> = { done: T[]; blocked: T[]; silent: T[]; late: T[]; onTrack: T[] };

// Each task lands in the first group that fits: finished since `since`, stuck,
// not answering, past its deadline, or moving
export function groupForDigest<T extends DigestTask>(tasks: T[], now: Date, since: Date): DigestGroups<T> {
  const g: DigestGroups<T> = { done: [], blocked: [], silent: [], late: [], onTrack: [] };
  for (const t of tasks) {
    if (t.status === "done") {
      if (t.completedAt && t.completedAt >= since) g.done.push(t);
    } else if (t.checkin === "blocked") g.blocked.push(t);
    else if (t.unanswered >= ESCALATE_AFTER) g.silent.push(t);
    else if (t.dueAt && t.dueAt < now) g.late.push(t);
    else g.onTrack.push(t);
  }
  return g;
}

export function digestEmpty(g: DigestGroups): boolean {
  return Object.values(g).every((list) => list.length === 0);
}

// The manager's morning report, without AI
export function digestText(g: DigestGroups): string {
  const who = (t: DigestTask) => (t.assignee ? ` (${t.assignee})` : "");
  const section = (title: string, list: DigestTask[], line: (t: DigestTask) => string) =>
    list.length ? ["", `${title} ${toPersianDigits(list.length)}`, ...list.slice(0, 8).map((t) => `• ${line(t)}`), ...(list.length > 8 ? [`• و ${toPersianDigits(list.length - 8)} کار دیگر`] : [])] : [];
  return [
    "📋 گزارش پیگیری کارها",
    ...section("🙋 گیر کرده:", g.blocked, (t) => `${t.title}${who(t)}${t.checkinNote ? ` — «${t.checkinNote}»` : ""}`),
    ...section("🔕 جواب نداده:", g.silent, (t) => `${t.title}${who(t)} · ${toPersianDigits(t.unanswered)} بار پرسیدم`),
    ...section("⚠️ عقب افتاده:", g.late, (t) => `${t.title}${who(t)} · مهلت ${formatJalaliDate(t.dueAt!)}`),
    ...section("✅ تمام شد:", g.done, (t) => `${t.title}${who(t)}`),
    ...section("⏳ در جریان:", g.onTrack, (t) => `${t.title}${who(t)}${t.dueAt ? ` · مهلت ${formatJalaliDate(t.dueAt)}` : ""}`),
  ].join("\n");
}
