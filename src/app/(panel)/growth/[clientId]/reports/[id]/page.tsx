import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Badge, Card, PageHeader } from "@/components/ui";
import { WeeklyReportView } from "@/components/weekly-report-view";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { formatJalaliDate } from "@/lib/format";
import type { WeeklyReport } from "@/lib/growth-ai";
import { shareReport } from "../../../actions";

export const metadata: Metadata = { title: "گزارش هفتگی" };

export default async function ReportPage(props: PageProps<"/growth/[clientId]/reports/[id]">) {
  await requireTeam();
  const { clientId, id } = await props.params;
  if (!isUuid(clientId) || !isUuid(id)) notFound();
  const [row] = await db
    .select({ insight: schema.insights, clientName: schema.clients.name })
    .from(schema.insights)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.insights.clientId))
    .where(and(eq(schema.insights.id, id), eq(schema.insights.clientId, clientId), eq(schema.insights.kind, "weekly_report")));
  if (!row) notFound();

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`گزارش هفتگی ${row.clientName}`}
          description={formatJalaliDate(row.insight.createdAt)}
          actions={
            <div className="flex items-center gap-2">
              {row.insight.sharedAt ? (
                <Badge tone="success">برای مشتری ارسال شد</Badge>
              ) : (
                <form action={shareReport.bind(null, clientId, id)}>
                  <button type="submit" className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow transition-[filter,transform] hover:brightness-105 active:scale-[0.97]">ارسال برای مشتری</button>
                </form>
              )}
              <PrintButton />
            </div>
          }
        />
        <Link href={`/growth/${clientId}`} className="mb-4 inline-block text-sm text-primary hover:underline">بازگشت به رشد پیج</Link>
      </div>
      <Card className="mx-auto max-w-3xl print:border-0 print:shadow-none">
        <p className="mb-4 hidden text-sm text-muted-foreground print:block">Onvioo · گزارش هفتگی {row.clientName} · {formatJalaliDate(row.insight.createdAt)}</p>
        <WeeklyReportView report={row.insight.data as WeeklyReport} />
      </Card>
    </>
  );
}
