"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  JALALI_MONTHS,
  addJalaliMonths,
  jalaliMonthDays,
  jalaliWeekday,
  toJalaliParts,
  toLatinDigits,
  toPersianDigits,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "./ui";

const WEEK_INITIALS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const pad = (n: number) => String(n).padStart(2, "0");

function parseValue(value: string) {
  const m = toLatinDigits(value).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return m ? { jy: +m[1], jm: +m[2], jd: +m[3] } : null;
}

// A Jalali date text field ("1405/07/27") with a pop-up month picker,
// plus an optional time field submitted as `${name}Time`.
export function JalaliDateField({
  id,
  name,
  defaultDate = "",
  defaultTime = "",
  withTime = false,
}: {
  id: string;
  name: string;
  defaultDate?: string;
  defaultTime?: string;
  withTime?: boolean;
}) {
  const [value, setValue] = useState(defaultDate);
  const [open, setOpen] = useState(false);
  const today = toJalaliParts(new Date());
  const selected = parseValue(value);
  const [view, setView] = useState(() => ({
    jy: selected?.jy ?? today.jy,
    jm: selected?.jm ?? today.jm,
  }));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const days = jalaliMonthDays(view.jy, view.jm);
  const lead = jalaliWeekday(view.jy, view.jm, 1);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <div ref={ref} className="relative flex gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="۱۴۰۵/۰۷/۲۷"
          className="ltr pl-9 text-right"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute left-1 top-1 rounded-md p-2 text-muted-foreground hover:text-primary"
          aria-label="انتخاب از تقویم"
        >
          <CalendarDays className="size-4" />
        </button>
      </div>
      {withTime && (
        <Input
          name={`${name}Time`}
          defaultValue={defaultTime}
          placeholder="۱۴:۳۰"
          className="ltr w-20 text-center"
          aria-label="ساعت"
          autoComplete="off"
        />
      )}
      {open && (
        <div className="absolute top-11 z-20 w-72 rounded-xl border border-border bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setView(addJalaliMonths(view.jy, view.jm, -1))} className="rounded-md p-1.5 hover:bg-muted" aria-label="ماه قبل">
              <ChevronRight className="size-4" />
            </button>
            <span className="text-sm font-semibold">
              {JALALI_MONTHS[view.jm - 1]} {toPersianDigits(view.jy)}
            </span>
            <button type="button" onClick={() => setView(addJalaliMonths(view.jy, view.jm, 1))} className="rounded-md p-1.5 hover:bg-muted" aria-label="ماه بعد">
              <ChevronLeft className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {WEEK_INITIALS.map((w) => (
              <span key={w} className="py-1 text-muted-foreground">{w}</span>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <span key={`e${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setValue(`${view.jy}/${pad(view.jm)}/${pad(d)}`);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-md py-1.5 hover:bg-muted",
                    selected?.jy === view.jy && selected.jm === view.jm && selected.jd === d && "bg-primary text-primary-foreground hover:bg-primary",
                    today.jy === view.jy && today.jm === view.jm && today.jd === d && "ring-1 ring-primary",
                  )}
                >
                  {toPersianDigits(d)}
                </button>
              ),
            )}
          </div>
          {value && (
            <button type="button" onClick={() => { setValue(""); setOpen(false); }} className="mt-2 w-full text-xs text-muted-foreground hover:text-danger">
              پاک کردن تاریخ
            </button>
          )}
        </div>
      )}
    </div>
  );
}
