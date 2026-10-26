import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { cronAuthorized } from "@/lib/cron";
import { buildMonthlyReport, reportableClients } from "@/lib/monthly-report";
import { notifyTeam } from "@/lib/notify";
import { periodLabel, periodOf, shiftPeriod } from "@/lib/payroll";
import { toPersianDigits } from "@/lib/format";

// Daily is fine: it drafts last month's report for any active client that has
// none yet, so it does real work on the first of the month and almost nothing after
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const period = shiftPeriod(periodOf(), -1);
  const clients = await reportableClients(period);
  const done = clients.length
    ? await db
        .select({ clientId: schema.monthlyReports.clientId })
        .from(schema.monthlyReports)
        .where(and(eq(schema.monthlyReports.period, period), inArray(schema.monthlyReports.clientId, clients.map((c) => c.id))))
    : [];
  const missing = clients.filter((c) => !done.some((d) => d.clientId === c.id));

  const made: string[] = [];
  let failed = 0;
  for (const c of missing) {
    try {
      const result = await buildMonthlyReport(c.id, period, null);
      if ("id" in result) made.push(c.name);
    } catch (error) {
      console.error("[cron] monthly report failed", c.id, error);
      failed++;
    }
  }
  if (made.length) {
    await notifyTeam({
      title: `گزارش ${periodLabel(period)} برای ${toPersianDigits(made.length)} مشتری آماده بازبینی است`,
      body: made.join("، "),
      href: `/reports?period=${period}`,
    });
  }
  return Response.json({ period, made: made.length, failed });
}
