"use client";

import { Bell, CalendarDays, Camera, Clapperboard, Clock, FileSignature, FolderUp, Globe, LayoutDashboard, LifeBuoy, ListTodo, LogOut, Trophy, TrendingUp, Users, UserCog, Wallet, Banknote, Receipt, Handshake, Activity, Sparkles, Bot, FileChartColumn } from "lucide-react";
import { toPersianDigits } from "@/lib/format";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/db/schema";
import { logout } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard, roles: ["admin", "staff"] },
  { href: "/content", label: "محتوا", icon: Clapperboard, roles: ["admin", "staff"] },
  { href: "/calendar", label: "تقویم", icon: CalendarDays, roles: ["admin", "staff"] },
  { href: "/growth", label: "رشد پیج‌ها", icon: TrendingUp, roles: ["admin", "staff"] },
  { href: "/reports", label: "گزارش ماهانه", icon: FileChartColumn, roles: ["admin", "staff"] },
  { href: "/tasks", label: "کارها", icon: ListTodo, roles: ["admin", "staff"] },
  { href: "/shoots", label: "جلسه‌های ضبط", icon: Camera, roles: ["admin", "staff"] },
  { href: "/projects", label: "پروژه‌های سایت", icon: Globe, roles: ["admin", "staff"] },
  { href: "/monitoring", label: "پایش سایت‌ها", icon: Activity, roles: ["admin", "staff"] },
  { href: "/tickets", label: "تیکت‌ها", icon: LifeBuoy, roles: ["admin", "staff"] },
  { href: "/clients", label: "مشتریان", icon: Users, roles: ["admin", "staff"] },
  { href: "/assistant", label: "دستیار", icon: Sparkles, roles: ["admin", "staff"] },
  { href: "/crm", label: "مشتریان بالقوه", icon: Handshake, roles: ["admin", "staff"] },
  { href: "/contracts", label: "قراردادها", icon: FileSignature, roles: ["admin"] },
  { href: "/invoices", label: "فاکتورها", icon: Receipt, roles: ["admin"] },
  { href: "/files", label: "فایل‌ها", icon: FolderUp, roles: ["admin", "staff"] },
  { href: "/attendance", label: "حضور و مرخصی", icon: Clock, roles: ["admin", "staff"] },
  { href: "/team", label: "امتیاز تیم", icon: Trophy, roles: ["admin", "staff"] },
  { href: "/staff", label: "کارکنان", icon: UserCog, roles: ["admin"] },
  { href: "/payroll", label: "حقوق", icon: Banknote, roles: ["admin"] },
  { href: "/finance", label: "مالی", icon: Wallet, roles: ["admin"] },
  { href: "/notifications", label: "اعلان‌ها", icon: Bell, roles: ["admin", "staff"] },
  { href: "/bot", label: "ربات بله و تلگرام", icon: Bot, roles: ["admin", "staff"] },
] as const;

export function PanelNav({ role, unread }: { role: Role; unread: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:px-3 md:pb-0 md:[scrollbar-width:thin]">
      {ITEMS.filter((item) => (item.roles as readonly Role[]).includes(role)).map(
        ({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium md:py-1.5 transition-[background-color,color,box-shadow] duration-200",
                active
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] transition-transform duration-300 ease-spring group-hover:scale-110",
                  href === "/notifications" && unread > 0 && "animate-ring",
                )}
              />
              {label}
              {href === "/notifications" && unread > 0 && (
                <span className="mr-auto animate-pop rounded-full bg-coral px-1.5 text-[10px] font-bold text-ink">
                  {toPersianDigits(Math.min(unread, 99))}
                </span>
              )}
            </Link>
          );
        },
      )}
    </nav>
  );
}

export function UserMenu({ name, role }: { name: string; role: Role }) {
  return (
    <div className="m-3 hidden items-center gap-1 rounded-3xl bg-muted p-2 md:flex">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lilac text-sm font-bold text-ink">
        {name.trim().charAt(0)}
      </span>
      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
      </div>
      <ThemeToggle />
      <form action={logout}>
        <button
          type="submit"
          title="خروج"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
