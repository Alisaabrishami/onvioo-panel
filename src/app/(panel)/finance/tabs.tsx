"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/finance", label: "خلاصه" },
  { href: "/finance/transactions", label: "تراکنش‌ها" },
  { href: "/finance/accounts", label: "حساب‌ها و تطبیق بانک" },
  { href: "/finance/clients", label: "سودآوری مشتری‌ها" },
  { href: "/finance/partners", label: "شرکا" },
  { href: "/finance/recurring", label: "هزینه‌های ثابت" },
  { href: "/finance/import", label: "ورود دیتای گذشته" },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border print:hidden">
      {TABS.map((t) => {
        const active = t.href === "/finance" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
