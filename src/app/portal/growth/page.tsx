import { ExternalLink, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart, compact } from "@/components/charts";
import { Delta } from "@/components/delta";
import { ForecastCard } from "@/components/forecast-card";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth/dal";
import { TYPE_LABELS } from "@/lib/content";
import { formatJalaliDate } from "@/lib/format";
import { performance } from "@/lib/growth";
import type { WeeklyReport } from "@/lib/growth-ai";
import { loadGrowth } from "@/lib/growth-view";

export const metadata: Metadata = { title: "آمار پیج" };

export default async function PortalGrowthPage() {
  const user = await requireClient();
  const g = await loadGrowth(user.clientId, { sharedOnly: true });

  if (g.own.length === 0 || g.series.length === 0) {
    return (
      <>
        <PageHeader title="آمار پیج" />
        <EmptyState>آمار پیج شما به‌زودی اینجا نمایش داده می‌شود.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="آمار پیج" description={`@${g.own[0].username}`} />
      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="فالوور" value={g.followers != null ? compact(g.followers) : "—"} />
        <Stat label="۷ روز اخیر" value={<Delta value={g.change7} />} />
        <Stat label="۳۰ روز اخیر" value={<Delta value={g.change30} />} />
        <Stat label="بازدید ۳۰ روز" value={g.viewsSeries.length ? compact(g.views30) : "—"} />
      </dl>

      {g.forecast && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold">پیش‌بینی رشد پیج شما</h2>
          <ForecastCard forecast={g.forecast} series={g.series} />
        </Card>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">بازدید روزانه</h2>
          <BarChart points={g.viewsSeries} label="بازدید روزانه" />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">پربازدیدترین محتواها</h2>
          {g.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز آماری ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2">
              {g.top.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{p.caption || TYPE_LABELS[p.type]}</span>
                    <span className="text-xs text-muted-foreground">{TYPE_LABELS[p.type]} · {formatJalaliDate(p.postedAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 font-medium">
                    {compact(performance(p))}
                    {p.permalink && (
                      <a href={p.permalink} target="_blank" rel="noreferrer" className="text-primary" aria-label="دیدن در اینستاگرام">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><FileText className="size-4 text-primary" />گزارش‌های هفتگی</h2>
        {g.reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">اولین گزارش هفتگی به‌زودی برایتان فرستاده می‌شود.</p>
        ) : (
          <ul className="divide-y divide-border">
            {g.reports.map((r) => (
              <li key={r.id} className="py-3">
                <Link href={`/portal/growth/reports/${r.id}`} className="font-medium hover:text-primary">{(r.data as WeeklyReport).headline}</Link>
                <p className="text-xs text-muted-foreground">{formatJalaliDate(r.sharedAt ?? r.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-bold">{value}</dd>
    </div>
  );
}
