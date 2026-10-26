"use client";

import { Bell, CalendarDays, Camera, ChevronDown, Clapperboard, Clock, FileSignature, FolderUp, Globe, LayoutDashboard, LifeBuoy, ListTodo, LogOut, Menu, Settings, Trophy, TrendingUp, Users, UserCog, Video, Wallet, Banknote, Receipt, Handshake, Activity, Sparkles, Bot, FileChartColumn, UserRound, Code, X, type LucideIcon } from "lucide-react";
import { toPersianDigits } from "@/lib/format";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/db/schema";
import { logout } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; roles: readonly Role[] };
type Group = { id: string; label: string; icon: LucideIcon; items: readonly Item[] };

const TEAM = ["admin", "staff"] as const;
const ADMIN = ["admin"] as const;

// Pages that stay on top, outside any section
const TOP: readonly Item[] = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard, roles: TEAM },
  { href: "/tasks", label: "کارها", icon: ListTodo, roles: TEAM },
  { href: "/notifications", label: "اعلان‌ها", icon: Bell, roles: TEAM },
  { href: "/assistant", label: "دستیار", icon: Sparkles, roles: TEAM },
];

const GROUPS: readonly Group[] = [
  {
    id: "instagram",
    label: "اینستاگرام",
    icon: Clapperboard,
    items: [
      { href: "/content", label: "محتوا", icon: Video, roles: TEAM },
      { href: "/calendar", label: "تقویم انتشار", icon: CalendarDays, roles: TEAM },
      { href: "/shoots", label: "جلسه‌های ضبط", icon: Camera, roles: TEAM },
      { href: "/files", label: "فایل‌ها", icon: FolderUp, roles: TEAM },
      { href: "/growth", label: "رشد پیج‌ها", icon: TrendingUp, roles: TEAM },
      { href: "/reports", label: "گزارش ماهانه", icon: FileChartColumn, roles: TEAM },
    ],
  },
  {
    id: "site",
    label: "سایت",
    icon: Globe,
    items: [
      { href: "/projects", label: "پروژه‌های سایت", icon: Globe, roles: TEAM },
      { href: "/monitoring", label: "پایش سایت‌ها", icon: Activity, roles: TEAM },
    ],
  },
  {
    id: "clients",
    label: "مشتریان",
    icon: Users,
    items: [
      { href: "/clients", label: "مشتریان", icon: Users, roles: TEAM },
      { href: "/crm", label: "مشتریان بالقوه", icon: Handshake, roles: TEAM },
      { href: "/tickets", label: "تیکت‌ها", icon: LifeBuoy, roles: TEAM },
      { href: "/contracts", label: "قراردادها", icon: FileSignature, roles: ADMIN },
    ],
  },
  {
    id: "finance",
    label: "مالی",
    icon: Wallet,
    items: [
      { href: "/finance", label: "حسابداری", icon: Wallet, roles: ADMIN },
      { href: "/invoices", label: "فاکتورها", icon: Receipt, roles: ADMIN },
      { href: "/payroll", label: "حقوق", icon: Banknote, roles: TEAM },
    ],
  },
  {
    id: "users",
    label: "کاربران",
    icon: UserCog,
    items: [
      { href: "/staff", label: "کارکنان", icon: UserCog, roles: ADMIN },
      { href: "/attendance", label: "حضور و مرخصی", icon: Clock, roles: TEAM },
      { href: "/team", label: "امتیاز تیم", icon: Trophy, roles: TEAM },
    ],
  },
  {
    id: "settings",
    label: "تنظیمات",
    icon: Settings,
    items: [
      { href: "/account", label: "حساب من", icon: UserRound, roles: TEAM },
      { href: "/bot", label: "ربات بله و تلگرام", icon: Bot, roles: TEAM },
      { href: "/developers", label: "API و اپ موبایل", icon: Code, roles: ADMIN },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PanelNav({ role, unread }: { role: Role; unread: number }) {
  const pathname = usePathname();
  const top = TOP.filter((item) => item.roles.includes(role));
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => item.roles.includes(role)) })).filter(
    (g) => g.items.length > 0,
  );
  const activeGroup = groups.find((g) => g.items.some((item) => isActive(pathname, item.href)))?.id;
  const current = [...top, ...groups.flatMap((g) => g.items)].find((item) => isActive(pathname, item.href));

  const [open, setOpen] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(pathname);
  // On navigation: close the mobile menu and unfold the section of the new page
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMobileOpen(false);
    if (activeGroup && !open.has(activeGroup)) setOpen(new Set(open).add(activeGroup));
  }

  function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  }

  const link = ({ href, label, icon: Icon }: Item, nested = false) => {
    const active = isActive(pathname, href);
    const bell = href === "/notifications" && unread > 0;
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "group flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium md:py-1.5 transition-[background-color,color,box-shadow] duration-200",
          nested && "ps-5",
          active
            ? "bg-primary text-primary-foreground shadow-glow"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className={cn("size-[18px] shrink-0 transition-transform duration-300 ease-spring group-hover:scale-110", bell && "animate-ring")} />
        <span className="truncate">{label}</span>
        {bell && (
          <span className="mr-auto animate-pop rounded-full bg-coral px-1.5 text-[10px] font-bold text-ink">
            {toPersianDigits(Math.min(unread, 99))}
          </span>
        )}
      </Link>
    );
  };

  const CurrentIcon = current?.icon ?? Menu;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-expanded={mobileOpen}
        className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-full bg-muted px-4 py-2.5 text-sm font-medium md:hidden"
      >
        <CurrentIcon className="size-[18px] text-primary" />
        <span className="flex-1 truncate text-start">{current?.label ?? "منو"}</span>
        {unread > 0 && !mobileOpen && (
          <span className="rounded-full bg-coral px-1.5 text-[10px] font-bold text-ink">{toPersianDigits(Math.min(unread, 99))}</span>
        )}
        {mobileOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
      </button>
      <nav
        className={cn(
          "flex-col gap-1 px-3 pb-3 md:flex md:min-h-0 md:flex-1 md:overflow-y-auto md:pb-0 md:[scrollbar-width:thin]",
          mobileOpen ? "flex max-h-[calc(100dvh-8rem)] animate-rise overflow-y-auto" : "hidden",
        )}
      >
        {top.map((item) => link(item))}
        {groups.map(({ id, label, icon: Icon, items }) => {
          const expanded = open.has(id);
          const hasActive = id === activeGroup;
          return (
            <div key={id} className="mt-1">
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors md:py-1.5",
                  hasActive && !expanded ? "text-primary" : "text-foreground",
                  "hover:bg-muted",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="flex-1 text-start">{label}</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", expanded && "rotate-180")} />
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="flex min-h-0 flex-col gap-1 overflow-hidden border-s border-border ms-5 ps-1 pt-1" inert={!expanded}>
                  {items.map((item) => link(item, true))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}

export function UserMenu({ name, role }: { name: string; role: Role }) {
  return (
    <div className="m-3 hidden items-center gap-1 rounded-3xl bg-muted p-2 md:flex">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lilac text-sm font-bold text-ink">
        {name.trim().charAt(0)}
      </span>
      <Link href="/account" title="حساب من" className="min-w-0 flex-1 rounded-2xl px-1 transition-colors hover:text-primary">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</p>
      </Link>
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
