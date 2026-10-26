import { and, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MonthlyReportView } from "@/components/monthly-report-view";
import { PrintButton } from "@/components/print-button";
import { Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import type { MonthlyReportData } from "@/lib/monthly";
import { periodLabel } from "@/lib/payroll";

export const metadata: Metadata = { title: "گزارش ماهانه" };

export default async function PortalMonthlyReportPage(props: PageProps<"/portal/reports/[id]">) {
  const user = await requireClient();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ report: schema.monthlyReports, clientName: schema.clients.name })
    .from(schema.monthlyReports)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.monthlyReports.clientId))
    .where(and(eq(schema.monthlyReports.id, id), eq(schema.monthlyReports.clientId, user.clientId), isNotNull(schema.monthlyReports.sharedAt)));
  if (!row) notFound();
  return (
    <>
      <div className="print:hidden">
        <PageHeader title={`گزارش ${periodLabel(row.report.period)}`} actions={<PrintButton />} />
        <Link href="/portal/reports" className="mb-4 inline-block text-sm text-primary hover:underline">همه گزارش‌ها</Link>
      </div>
      <Card className="mx-auto max-w-3xl print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <MonthlyReportView data={row.report.data as MonthlyReportData} clientName={row.clientName} period={row.report.period} note={row.report.note} />
      </Card>
    </>
  );
}
