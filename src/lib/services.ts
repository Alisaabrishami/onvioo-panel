import type { ProjectStatus, ServiceKind, TicketStatus } from "@/db/schema";

export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  website: "طراحی سایت",
  frontend: "فرانت‌اند",
  backend: "بک‌اند",
  seo: "سئو",
  support: "پشتیبانی سایت",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "برنامه‌ریزی",
  in_progress: "در حال انجام",
  review: "منتظر بازبینی",
  done: "تحویل شد",
  paused: "متوقف",
};

export const PROJECT_STATUS_TONES = {
  planning: "neutral",
  in_progress: "primary",
  review: "warning",
  done: "success",
  paused: "danger",
} as const satisfies Record<ProjectStatus, string>;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "منتظر پاسخ تیم",
  answered: "پاسخ داده شد",
  closed: "بسته شد",
};

export const TICKET_STATUS_TONES = {
  open: "warning",
  answered: "primary",
  closed: "neutral",
} as const satisfies Record<TicketStatus, string>;

// Typical steps for each kind of job, offered when a project is created
export const DEFAULT_MILESTONES: Record<ServiceKind, string[]> = {
  website: ["جلسه نیازسنجی", "طراحی UI و تأیید مشتری", "پیاده‌سازی فرانت‌اند", "پیاده‌سازی بک‌اند و پنل", "سئوی اولیه و تست", "تحویل و آموزش"],
  frontend: ["دریافت طرح", "پیاده‌سازی صفحات", "ریسپانسیو و تست", "تحویل"],
  backend: ["طراحی دیتابیس و API", "پیاده‌سازی", "تست و امنیت", "استقرار روی سرور"],
  seo: ["آنالیز سایت و رقبا", "تحقیق کلمات کلیدی", "سئوی فنی", "بهینه‌سازی محتوا", "گزارش ماهانه"],
  support: ["بررسی وضعیت سایت", "به‌روزرسانی و پشتیبان‌گیری", "گزارش ماهانه"],
};

export function progressOf(milestones: { done: boolean }[]): number {
  if (milestones.length === 0) return 0;
  return Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100);
}
