"use client";

import { Bell, CalendarDays, Camera, Clapperboard, FileSignature, FolderUp, Globe, LayoutDashboard, LifeBuoy, ListTodo, LogOut, TrendingUp, Users, UserCog } from "lucide-react";
import { toPersianDigits } from "@/lib/format";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/db/schema";
import { logout } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard, roles: ["admin", "staff"] },
  { href: "/content", label: "محتوا", icon: Clapperboard, roles: ["admin", "staff"] },
  { href: "/calendar", label: "تقویم", icon: CalendarDays, roles: ["admin", "staff"] },
  { href: "/growth", label: "رشد پیج‌ها", icon: TrendingUp, roles: ["admin", "staff"] },
  { href: "/tasks", label: "کارها", icon: ListTodo, roles: ["admin", "staff"] },
  { href: "/shoots", label: "جلسه‌های ضبط", icon: Camera, roles: ["admin", "staff"] },
  { href: "/projects", label: "پروژه‌های سایت", icon: Globe, roles: ["admin", "staff"] },
  { href: "/tickets", label: "تیکت‌ها", icon: LifeBuoy, roles: ["admin", "staff"] },
  { href: "/clients", label: "مشتریان", icon: Users, roles: ["admin", "staff"] },
  { href: "/contracts", label: "قراردادها", icon: FileSignature, roles: ["admin"] },
  { href: "/files", label: "فایل‌ها", icon: FolderUp, roles: ["admin", "staff"] },
  { href: "/staff", label: "کارکنان", icon: UserCog, roles: ["admin"] },
  { href: "/notifications", label: "اعلان‌ها", icon: Bell, roles: ["admin", "staff"] },
] as const;

export function PanelNav({ role, unread }: { role: Role; unread: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:px-3 md:pb-0">
      {ITEMS.filter((item) => (item.roles as readonly Role[]).includes(role)).map(
        ({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
              {label}
              {href === "/notifications" && unread > 0 && (
                <span className="mr-auto rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
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
    <div className="hidden items-center justify-between gap-2 border-t border-border p-4 md:flex">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
      </div>
      <form action={logout}>
        <button
          type="submit"
          title="خروج"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-danger"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
