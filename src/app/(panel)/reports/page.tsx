import { and, eq } from "drizzle-orm";
import { FileText, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { PeriodNav, readPeriod } from "@/components/period-nav";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { formatJalaliDate } from "@/lib/format";
import { reportableClients } from "@/lib/monthly-report";
import { periodLabel, periodOf, shiftPeriod } from "@/lib/payroll";
import { generateReport } from "./actions";

export const metadata: Metadata = { title: "گزارش ماهانه" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  await requireTeam();
  const last = shiftPeriod(periodOf(), -1);
  const period = readPeriod((await props.searchParams).period, last);
  const [clients, reports] = await Promise.all([
    reportableClients(period),
    db
      .select({ id: schema.monthlyReports.id, clientId: schema.monthlyReports.clientId, sharedAt: schema.monthlyReports.sharedAt, updatedAt: schema.monthlyReports.updatedAt })
      .from(schema.monthlyReports)
      .where(and(eq(schema.monthlyReports.period, period))),
  ]);
  const shared = reports.filter((r) => r.sharedAt).length;

  return (
    <>
      <PageHeader
        title="گزارش ماهانه مشتری‌ها"
        description="اول هر ماه برای هر مشتری فعال یک پیش‌نویس ساخته می‌شود؛ بازبینی کنید و برایش بفرستید"
        actions={<PeriodNav period={period} basePath="/reports" current={last} />}
      />
      {clients.length === 0 ? (
        <EmptyState>در {periodLabel(period)} مشتری فعالی نبود.</EmptyState>
      ) : (
        <Card className="max-w-4xl">
          <p className="mb-3 text-sm text-muted-foreground">
            {periodLabel(period)}: {reports.length.toLocaleString("fa-IR")} گزارش از {clients.length.toLocaleString("fa-IR")} مشتری، {shared.toLocaleString("fa-IR")} فرستاده‌شده
          </p>
          <ul className="divide-y divide-border" data-testid="report-list">
            {clients.map((c) => {
              const r = reports.find((x) => x.clientId === c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {r?.sharedAt ? (
                      <Badge tone="success">
                        <Send className="size-3" />
                        فرستاده شد {formatJalaliDate(r.sharedAt)}
                      </Badge>
                    ) : r ? (
                      <Badge tone="info">پیش‌نویس</Badge>
                    ) : (
                      <Badge>ساخته نشده</Badge>
                    )}
                    {r ? (
                      <Link href={`/reports/${r.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs hover:bg-muted">
                        <FileText className="size-3.5" />
                        {r.sharedAt ? "دیدن" : "بازبینی و ارسال"}
                      </Link>
                    ) : (
                      <ActionButton action={generateReport.bind(null, c.id, period)} pendingLabel="در حال ساختن…" className="h-8 px-3 text-xs">
                        ساختن گزارش
                      </ActionButton>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
