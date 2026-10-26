import type { Role } from "@/db/schema";
import { toLatinDigits, toPersianDigits } from "./format";

// Pure pieces of the Bale/Telegram bot: menus, commands and message text

export type BotCommand = "help" | "tasks" | "today" | "clockin" | "clockout" | "review" | "invoices" | "reports" | "cancel" | "unlink";

export const MENU_LABELS = {
  tasks: "📋 کارهای من",
  today: "🗓 برنامه امروز",
  clockin: "🟢 ورود",
  clockout: "🔴 خروج",
  review: "📝 منتظر تأیید من",
  invoices: "🧾 فاکتورهای باز",
  reports: "📊 گزارش‌ها",
  help: "راهنما",
} as const;

const SLASH: Record<string, BotCommand> = {
  start: "help",
  help: "help",
  tasks: "tasks",
  today: "today",
  in: "clockin",
  out: "clockout",
  review: "review",
  invoices: "invoices",
  reports: "reports",
  cancel: "cancel",
  stop: "unlink",
};

export function menuFor(role: Role): string[][] {
  return role === "client"
    ? [[MENU_LABELS.review, MENU_LABELS.invoices], [MENU_LABELS.reports, MENU_LABELS.help]]
    : [[MENU_LABELS.tasks, MENU_LABELS.today], [MENU_LABELS.clockin, MENU_LABELS.clockout], [MENU_LABELS.help]];
}

// "/tasks", "/tasks@onvioo_bot" or a menu button's text
export function parseCommand(text: string): { command: BotCommand; arg: string } | null {
  const t = text.trim();
  const slash = /^\/([a-z]+)(?:@\w+)?(?:\s+(.*))?$/i.exec(t);
  if (slash) {
    const command = SLASH[slash[1].toLowerCase()];
    return command ? { command, arg: (slash[2] ?? "").trim() } : null;
  }
  if (t === "انصراف" || t === "لغو") return { command: "cancel", arg: "" };
  const entry = Object.entries(MENU_LABELS).find(([, label]) => label === t);
  return entry ? { command: entry[0] as BotCommand, arg: "" } : null;
}

// The commands a role may use; the rest get a polite "not for you"
export function allowed(role: Role, command: BotCommand): boolean {
  const team: BotCommand[] = ["tasks", "today", "clockin", "clockout"];
  const client: BotCommand[] = ["review", "invoices", "reports"];
  if (team.includes(command)) return role !== "client";
  if (client.includes(command)) return role === "client";
  return true;
}

export function helpText(name: string, role: Role): string {
  const lines =
    role === "client"
      ? [
          `${MENU_LABELS.review}: محتواهایی که منتظر نظر شماست، با دکمه تأیید یا اصلاحیه`,
          `${MENU_LABELS.invoices}: فاکتورهای پرداخت‌نشده و لینک پرداخت`,
          `${MENU_LABELS.reports}: گزارش‌های ماهانه پیج و کارها`,
        ]
      : [
          `${MENU_LABELS.tasks}: کارهای باز شما؛ با یک دکمه انجام‌شده می‌شوند`,
          `${MENU_LABELS.today}: کارها، ضبط‌ها و مهلت‌های امروز`,
          `${MENU_LABELS.clockin} و ${MENU_LABELS.clockout}: ثبت ساعت کار`,
        ];
  return [`سلام ${name} 👋`, "اعلان‌های پنل انوییو اینجا هم می‌آیند. از دکمه‌های پایین صفحه استفاده کنید:", "", ...lines, "", "برای قطع اتصال: /stop"].join("\n");
}

export const NOT_LINKED =
  "این گفتگو هنوز به حسابی در پنل انوییو وصل نیست.\nدر پنل، صفحه «ربات بله و تلگرام» را باز کنید و دکمه اتصال را بزنید، یا کد اتصال را همین‌جا بفرستید.";

// "۲ ساعت و ۱۵ دقیقه"
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${toPersianDigits(rest)} دقیقه`;
  return rest ? `${toPersianDigits(h)} ساعت و ${toPersianDigits(rest)} دقیقه` : `${toPersianDigits(h)} ساعت`;
}

// Button text is cut so long titles don't wrap into a wall of text
export function shorten(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function callback(data: string): { verb: string; id: string } | null {
  const m = /^([a-z]{2}):(.+)$/.exec(data);
  return m ? { verb: m[1], id: m[2] } : null;
}

// A connect code as typed: case, spaces and dashes don't matter
export function normalizeCode(text: string): string | null {
  const code = text.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{10}$/.test(code) ? code : null;
}

// The first m:ss in a change request, so the editor can jump to that moment
export function timecodeIn(text: string): number | null {
  const m = /(?:^|\D)(\d{1,2}):([0-5]\d)(?!\d)/.exec(toLatinDigits(text));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
