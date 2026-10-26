import { and, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Card, PageHeader } from "@/components/ui";
import { WeeklyReportView } from "@/components/weekly-report-view";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { formatJalaliDate } from "@/lib/format";
import type { WeeklyReport } from "@/lib/growth-ai";

export const metadata: Metadata = { title: "گزارش هفتگی" };

export default async function PortalReportPage(props: PageProps<"/portal/growth/reports/[id]">) {
  const user = await requireClient();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [report] = await db
    .select()
    .from(schema.insights)
    .where(
      and(
        eq(schema.insights.id, id),
        eq(schema.insights.clientId, user.clientId),
        eq(schema.insights.kind, "weekly_report"),
        isNotNull(schema.insights.sharedAt),
      ),
    );
  if (!report) notFound();

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="گزارش هفتگی پیج" description={formatJalaliDate(report.sharedAt ?? report.createdAt)} actions={<PrintButton />} />
        <Link href="/portal/growth" className="mb-4 inline-block text-sm text-primary hover:underline">بازگشت به آمار پیج</Link>
      </div>
      <Card className="mx-auto max-w-3xl print:border-0 print:shadow-none">
        <p className="mb-4 hidden text-sm text-muted-foreground print:block">Onvioo · گزارش هفتگی · {formatJalaliDate(report.sharedAt ?? report.createdAt)}</p>
        <WeeklyReportView report={report.data as WeeklyReport} />
      </Card>
    </>
  );
}
