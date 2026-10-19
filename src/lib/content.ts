import type { ContentStage, ContentType, TaskPriority, TaskStatus } from "@/db/schema";

export const STAGES: readonly ContentStage[] = [
  "idea",
  "shot",
  "editing",
  "internal_review",
  "client_review",
  "ready",
  "published",
];

export const STAGE_LABELS: Record<ContentStage, string> = {
  idea: "ایده",
  shot: "ضبط شد",
  editing: "در حال تدوین",
  internal_review: "بازبینی داخلی",
  client_review: "منتظر تأیید مشتری",
  ready: "آماده انتشار",
  published: "منتشر شد",
};

export const STAGE_TONES = {
  idea: "neutral",
  shot: "primary",
  editing: "warning",
  internal_review: "warning",
  client_review: "primary",
  ready: "success",
  published: "success",
} as const satisfies Record<ContentStage, string>;

export const TYPE_LABELS: Record<ContentType, string> = {
  reel: "ریلز",
  story: "استوری",
  post: "پست",
  carousel: "اسلاید",
  video: "ویدیو بلند",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "انجام نشده",
  doing: "در حال انجام",
  done: "انجام شد",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "کم",
  normal: "معمولی",
  high: "مهم",
  urgent: "فوری",
};

export const PRIORITY_TONES = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  urgent: "danger",
} as const satisfies Record<TaskPriority, string>;

export type AutoTask = { key: string; title: string };

// Moving content into a stage where someone on the team has work to do
// opens a task for the assignee; leaving that stage closes it.
const STAGE_TASKS: Partial<Record<ContentStage, (title: string, again: boolean) => string>> = {
  editing: (title, again) => (again ? `اعمال اصلاحات: ${title}` : `تدوین: ${title}`),
  internal_review: (title) => `بازبینی: ${title}`,
  ready: (title) => `انتشار: ${title}`,
};

export function autoTaskFor(
  to: ContentStage,
  from: ContentStage | null,
  title: string,
): AutoTask | null {
  const make = STAGE_TASKS[to];
  if (!make) return null;
  // Coming back from review means the client or reviewer asked for changes
  const again = to === "editing" && (from === "internal_review" || from === "client_review");
  return { key: `stage:${to}`, title: make(title, again) };
}

export function isOverdue(dueAt: Date | null, now = new Date()): boolean {
  return dueAt !== null && dueAt.getTime() < now.getTime();
}

export const DEFAULT_CHECKLIST = "دوربین و لنز\nباتری و کارت حافظه\nمیکروفون یقه‌ای\nنور و سه‌پایه\nگیمبال";
