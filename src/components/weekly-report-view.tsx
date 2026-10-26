import { ExternalLink } from "lucide-react";
import { compact } from "@/components/charts";
import type { WeeklyReport } from "@/lib/growth-ai";

export function WeeklyReportView({ report }: { report: WeeklyReport }) {
  const { stats } = report;
  const change = stats.change7;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">{report.headline}</h2>
        <p className="mt-2 text-sm leading-7">{report.summary}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="فالوور" value={stats.followers != null ? compact(stats.followers) : "—"} />
        <Stat label="تغییر هفته" value={change != null ? `${change >= 0 ? "+" : "−"}${compact(Math.abs(change))}` : "—"} />
        <Stat label="بازدید هفته" value={compact(stats.views7)} />
        <Stat label="محتوای منتشرشده" value={compact(stats.posts7)} />
      </dl>
      <Section title="چه چیزی جواب داد" items={report.worked} />
      <Section title="چه چیزی کمتر دیده شد" items={report.didnt} />
      <Section title="پیشنهاد برای هفته بعد" items={report.nextWeek} />
      {stats.topPosts.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">بهترین محتواهای هفته</h3>
          <ol className="space-y-1.5 text-sm">
            {stats.topPosts.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
                <span className="truncate">{p.caption || "بدون کپشن"}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {compact(p.views)} بازدید
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="text-primary print:hidden" aria-label="دیدن در اینستاگرام">
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-bold">{value}</dd>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="list-disc space-y-1 pr-5 text-sm leading-7">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
