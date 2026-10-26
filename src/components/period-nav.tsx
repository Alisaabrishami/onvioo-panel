import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { periodLabel, shiftPeriod } from "@/lib/payroll";

// Previous / next Jalali month as ?period= links
export function PeriodNav({ period, basePath, current, query }: { period: string; basePath: string; current: string; query?: Record<string, string> }) {
  const href = (p: string) => `${basePath}?${new URLSearchParams({ ...query, period: p })}`;
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
      <Link href={href(shiftPeriod(period, -1))} className="rounded-md p-1.5 hover:bg-muted" aria-label="ماه قبل">
        <ChevronRight className="size-4" />
      </Link>
      <span className="min-w-24 text-center text-sm font-medium">{periodLabel(period)}</span>
      {period < current ? (
        <Link href={href(shiftPeriod(period, 1))} className="rounded-md p-1.5 hover:bg-muted" aria-label="ماه بعد">
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span className="p-1.5 opacity-30"><ChevronLeft className="size-4" /></span>
      )}
    </div>
  );
}

export function readPeriod(value: string | string[] | undefined, fallback: string): string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value) && value <= fallback ? value : fallback;
}
