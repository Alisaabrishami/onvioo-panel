"use client";

import { Bell, Clapperboard, FileSignature, Globe, Home, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toPersianDigits } from "@/lib/format";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/portal", label: "خانه", icon: Home },
  { href: "/portal/content", label: "محتوا", icon: Clapperboard },
  { href: "/portal/projects", label: "سایت", icon: Globe },
  { href: "/portal/tickets", label: "پشتیبانی", icon: LifeBuoy },
  { href: "/portal/contracts", label: "قراردادها", icon: FileSignature },
];

export function PortalNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/portal" ? pathname === href : pathname.startsWith(href));
  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
            isActive(href) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
      <Link
        href="/portal/notifications"
        aria-label="اعلان‌ها"
        className={cn(
          "relative mr-auto shrink-0 rounded-lg p-2",
          isActive("/portal/notifications") ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
        )}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -left-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {toPersianDigits(Math.min(unread, 99))}
          </span>
        )}
      </Link>
    </nav>
  );
}
