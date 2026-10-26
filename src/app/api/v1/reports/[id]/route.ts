import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { appLink } from "@/lib/bot";
import type { MonthlyReportData } from "@/lib/monthly";
import { periodLabel } from "@/lib/payroll";
import { authed, idParam, notFound, clientOf } from "@/lib/api/http";

// The full report; pdfUrl opens the printable page in the portal
export const GET = authed<RouteContext<"/api/v1/reports/[id]">>(async (user, _request, ctx) => {
  const id = idParam((await ctx.params).id);
  const client = user.role === "client";
  const [row] = await db
    .select({ report: schema.monthlyReports, clientName: schema.clients.name })
    .from(schema.monthlyReports)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.monthlyReports.clientId))
    .where(and(eq(schema.monthlyReports.id, id), client ? and(eq(schema.monthlyReports.clientId, clientOf(user)), isNotNull(schema.monthlyReports.sharedAt)) : undefined));
  if (!row) throw notFound();
  const { report } = row;
  const data = report.data as MonthlyReportData;
  // Billing stays with admins and the client, like in the panel
  const stats = user.role === "staff" ? { ...data.stats, billing: null } : data.stats;
  return {
    id: report.id,
    clientId: report.clientId,
    clientName: row.clientName,
    period: report.period,
    periodLabel: periodLabel(report.period),
    note: report.note,
    sharedAt: report.sharedAt,
    headline: data.headline,
    summary: data.summary,
    highlights: data.highlights,
    nextMonth: data.nextMonth,
    stats,
    pdfUrl: appLink(client ? `/portal/reports/${report.id}` : `/reports/${report.id}`),
  };
});
