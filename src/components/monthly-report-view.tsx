import { ExternalLink } from "lucide-react";
import { compact } from "@/components/charts";
import { Logo } from "@/components/logo";
import { TYPE_LABELS } from "@/lib/content";
import { formatToman, toPersianDigits } from "@/lib/format";
import type { MonthlyReportData } from "@/lib/monthly";
import { periodLabel } from "@/lib/payroll";
import { PROJECT_STATUS_LABELS } from "@/lib/services";
import type { ContentType, ProjectStatus } from "@/db/schema";

// The report as the client sees it, laid out to print on A4 as a PDF
export function MonthlyReportView({ data, clientName, period, note }: { data: MonthlyReportData; clientName: string; period: string; note: string | null }) {
  const { stats } = data;
  const ig = stats.instagram;
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${compact(Math.abs(n))}`;
  return (
    <article className="space-y-6" data-testid="monthly-report">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs text-muted-foreground">گزارش ماهانه</p>
          <h2 className="text-xl font-bold">
            {clientName} · {periodLabel(period)}
          </h2>
        </div>
        <Logo />
      </header>

      {note && <p className="whitespace-pre-line rounded-2xl bg-primary/10 p-4 text-sm leading-7">{note}</p>}

      <div>
        <h3 className="text-lg font-bold">{data.headline}</h3>
        <p className="mt-2 text-sm leading-7">{data.summary}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
        <Stat label="محتوای منتشرشده" value={toPersianDigits(stats.content.published)} />
        <Stat label="جلسه ضبط" value={toPersianDigits(stats.shoots)} />
        <Stat label="تغییر فالوور" value={ig?.change != null ? signed(ig.change) : "—"} />
        <Stat label="بازدید پیج" value={ig ? compact(ig.views) : "—"} />
      </dl>

      <Section title="نتیجه‌های این ماه" items={data.highlights} />

      {stats.content.published > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">محتواهای منتشرشده</h3>
          <p className="mb-2 flex flex-wrap gap-2 text-xs">
            {Object.entries(stats.content.byType).map(([t, n]) => (
              <span key={t} className="rounded-full bg-muted px-2.5 py-1">
                {TYPE_LABELS[t as ContentType]}: {toPersianDigits(n!)}
              </span>
            ))}
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {stats.content.titles.map((t) => (
              <li key={t} className="truncate">• {t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {toPersianDigits(stats.content.approved)} تأیید، {toPersianDigits(stats.content.revisions)} اصلاحیه، {toPersianDigits(stats.content.inProgress)} محتوا در حال ساخت
          </p>
        </div>
      )}

      {ig && ig.topPosts.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">پربازدیدترین پست‌ها</h3>
          <ol className="space-y-1.5 text-sm">
            {ig.topPosts.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
                <span className="min-w-0 truncate">{p.caption || "بدون کپشن"}</span>
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

      {(stats.site.projects.length > 0 || stats.site.uptime != null || stats.site.ticketsOpened > 0) && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">سایت و پشتیبانی</h3>
          <ul className="space-y-1.5 text-sm">
            {stats.site.projects.map((p) => (
              <li key={p.title} className="flex flex-wrap justify-between gap-2">
                <span>{p.title} · {PROJECT_STATUS_LABELS[p.status as ProjectStatus] ?? p.status}</span>
                {p.total > 0 && <span className="text-xs text-muted-foreground">{toPersianDigits(p.done)} از {toPersianDigits(p.total)} مرحله</span>}
              </li>
            ))}
            {stats.site.uptime != null && <li>در دسترس بودن سایت: {toPersianDigits(stats.site.uptime)}٪</li>}
            {stats.site.ticketsOpened + stats.site.ticketsClosed > 0 && (
              <li>
                تیکت‌ها: {toPersianDigits(stats.site.ticketsOpened)} درخواست جدید، {toPersianDigits(stats.site.ticketsClosed)} بسته‌شده
              </li>
            )}
          </ul>
        </div>
      )}

      {stats.billing.invoiced + stats.billing.paid + stats.billing.outstanding > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">مالی</h3>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <Money label="فاکتور این ماه" value={stats.billing.invoiced} />
            <Money label="پرداخت این ماه" value={stats.billing.paid} />
            <Money label="مانده پرداخت‌نشده" value={stats.billing.outstanding} />
          </dl>
        </div>
      )}

      <Section title="برنامه ماه بعد" items={data.nextMonth} />
    </article>
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

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{formatToman(value)}</dd>
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
