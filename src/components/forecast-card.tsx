"use client";

import { useState } from "react";
import { compact, LineChart, type ChartPoint } from "@/components/charts";
import { toPersianDigits } from "@/lib/format";
import { addDays, project, type Forecast } from "@/lib/growth";
import { cn } from "@/lib/utils";

const HORIZONS = [30, 90, 180] as const;

export function ForecastCard({ forecast, series }: { forecast: Forecast; series: ChartPoint[] }) {
  const [days, setDays] = useState<(typeof HORIZONS)[number]>(90);
  const [extra, setExtra] = useState(0);
  const target = project(forecast, days, extra);
  const plain = project(forecast, days);
  const steps = 6;
  const projection = Array.from({ length: steps }, (_, i) => {
    const d = Math.round(((i + 1) * days) / steps);
    return { day: addDays(forecast.lastDay, d), value: project(forecast, d, extra) };
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">با این روند، {toPersianDigits(days)} روز دیگر</p>
          <p className="text-2xl font-bold">{compact(target)} فالوور</p>
          <p className="text-xs text-muted-foreground">
            روزانه حدود {toPersianDigits(Math.round(forecast.perDay))} فالوور
            {extra > 0 && forecast.perReel && ` · ${compact(target - plain)} بیشتر با ${toPersianDigits(extra)} ریلز اضافه در هفته`}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="بازه پیش‌بینی">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setDays(h)}
              aria-pressed={days === h}
              className={cn("rounded-md px-3 py-1 text-xs font-medium", days === h ? "bg-surface shadow-sm" : "text-muted-foreground")}
            >
              {toPersianDigits(h)} روز
            </button>
          ))}
        </div>
      </div>
      <LineChart points={series} projection={projection} label="فالوور و پیش‌بینی" />
      {forecast.perReel ? (
        <label className="mt-4 block text-sm">
          <span className="mb-1 flex justify-between">
            <span>ریلز اضافه در هفته</span>
            <span className="font-medium">{toPersianDigits(extra)}</span>
          </span>
          <input type="range" min={0} max={5} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
          <span className="mt-1 block text-xs text-muted-foreground">
            الان حدود {toPersianDigits(forecast.reelsPerWeek.toFixed(1))} ریلز در هفته؛ هر ریلز اضافه در هفته‌های گذشته حدود {toPersianDigits(Math.round(forecast.perReel))} فالوور آورده است.
          </span>
        </label>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          برای اینکه اثر ریلز بیشتر را حساب کنم، آمار حداقل چهار هفته با تعداد ریلز متفاوت لازم است.
        </p>
      )}
    </div>
  );
}
