import { eq } from "drizzle-orm";
import { ArrowRight, RefreshCw, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { MonthlyReportView } from "@/components/monthly-report-view";
import { PrintButton } from "@/components/print-button";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { formatJalaliDateTime } from "@/lib/format";
import type { MonthlyReportData } from "@/lib/monthly";
import { periodLabel } from "@/lib/payroll";
import { generateReport, shareMonthlyReport } from "../actions";
import { NoteForm } from "./note-form";

export const metadata: Metadata = { title: "گزارش ماهانه" };

export default async function ReportPage(props: PageProps<"/reports/[id]">) {
  const user = await requireTeam();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ report: schema.monthlyReports, clientName: schema.clients.name })
    .from(schema.monthlyReports)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.monthlyReports.clientId))
    .where(eq(schema.monthlyReports.id, id));
  if (!row) notFound();
  const { report } = row;
  const data = report.data as MonthlyReportData;
  // Billing figures stay with admins, like the rest of finance
  const shown = user.role === "admin" ? data : { ...data, stats: { ...data.stats, billing: { invoiced: 0, paid: 0, outstanding: 0 } } };

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`${row.clientName} · ${periodLabel(report.period)}`}
          description={report.sharedAt ? `برای مشتری فرستاده شد: ${formatJalaliDateTime(report.sharedAt)}` : `پیش‌نویس · ${formatJalaliDateTime(report.updatedAt)}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/reports?period=${report.period}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-muted">
                <ArrowRight className="size-4" />
                همه گزارش‌ها
              </Link>
              <PrintButton />
            </div>
          }
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
        <Card className="print:border-0 print:p-0 print:shadow-none">
          <MonthlyReportView data={shown} clientName={row.clientName} period={report.period} note={report.note} />
        </Card>
        <div className="space-y-4 print:hidden">
          <Card className="space-y-3">
            {report.sharedAt ? (
              <Badge tone="success">
                <Send className="size-3" />
                مشتری این گزارش را در پورتال و پیام‌رسان می‌بیند
              </Badge>
            ) : (
              <>
                <h2 className="font-semibold">ارسال برای مشتری</h2>
                <p className="text-xs leading-6 text-muted-foreground">گزارش در پورتال مشتری نمایش داده می‌شود و با پیامک و ربات بله یا تلگرام خبرش می‌کنیم.</p>
                <ActionButton action={shareMonthlyReport.bind(null, report.id)} pendingLabel="در حال ارسال…" variant="primary">
                  <Send className="size-4" />
                  ارسال برای مشتری
                </ActionButton>
              </>
            )}
            {!data.ai && <p className="text-xs text-muted-foreground">متن این گزارش بدون هوش مصنوعی و از روی عددها نوشته شده است.</p>}
          </Card>
          {!report.sharedAt && (
            <>
              <Card className="space-y-2">
                <h2 className="text-sm font-semibold">پیام تیم</h2>
                <p className="text-xs text-muted-foreground">اختیاری؛ بالای گزارش نمایش داده می‌شود.</p>
                <NoteForm reportId={report.id} note={report.note ?? ""} />
              </Card>
              <ActionButton action={generateReport.bind(null, report.clientId, report.period)} pendingLabel="در حال ساختن…" variant="ghost" className="h-8 px-3 text-xs">
                <RefreshCw className="size-3.5" />
                ساختن دوباره با آخرین عددها
              </ActionButton>
            </>
          )}
        </div>
      </div>
    </>
  );
}
