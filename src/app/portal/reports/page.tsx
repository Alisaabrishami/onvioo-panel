import { and, desc, eq, isNotNull } from "drizzle-orm";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { formatJalaliDate } from "@/lib/format";
import type { MonthlyReportData } from "@/lib/monthly";
import { periodLabel } from "@/lib/payroll";

export const metadata: Metadata = { title: "گزارش ماهانه" };

export default async function PortalReportsPage() {
  const user = await requireClient();
  const reports = await db
    .select()
    .from(schema.monthlyReports)
    .where(and(eq(schema.monthlyReports.clientId, user.clientId), isNotNull(schema.monthlyReports.sharedAt)))
    .orderBy(desc(schema.monthlyReports.period));
  return (
    <>
      <PageHeader title="گزارش‌های ماهانه" description="کارهای هر ماه، آمار پیج و برنامه ماه بعد" />
      {reports.length === 0 ? (
        <EmptyState>اولین گزارش ماهانه بعد از پایان این ماه اینجا می‌آید.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          {reports.map((r) => (
            <Link key={r.id} href={`/portal/reports/${r.id}`}>
              <Card className="h-full space-y-2 transition-shadow hover:shadow-glow">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="size-4 text-primary" />
                  {periodLabel(r.period)}
                </p>
                <p className="text-sm leading-6">{(r.data as MonthlyReportData).headline}</p>
                <p className="text-xs text-muted-foreground">{formatJalaliDate(r.sharedAt!)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
