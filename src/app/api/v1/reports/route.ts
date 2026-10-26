import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MonthlyReportData } from "@/lib/monthly";
import { periodLabel } from "@/lib/payroll";
import { authed, page, query, uuidParam, clientOf } from "@/lib/api/http";

// Monthly reports. Client: those sent to them. Team: all, ?clientId= ?period=1405-07
export const GET = authed(async (user, request) => {
  const q = query(request);
  const { limit, offset } = page(request);
  const clientId = uuidParam(request, "clientId");
  const client = user.role === "client";
  const rows = await db
    .select({ id: schema.monthlyReports.id, clientId: schema.monthlyReports.clientId, clientName: schema.clients.name, period: schema.monthlyReports.period, data: schema.monthlyReports.data, sharedAt: schema.monthlyReports.sharedAt })
    .from(schema.monthlyReports)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.monthlyReports.clientId))
    .where(
      and(
        client ? and(eq(schema.monthlyReports.clientId, clientOf(user)), isNotNull(schema.monthlyReports.sharedAt)) : undefined,
        !client && clientId ? eq(schema.monthlyReports.clientId, clientId) : undefined,
        !client && q.get("period") ? eq(schema.monthlyReports.period, q.get("period")!) : undefined,
      ),
    )
    .orderBy(desc(schema.monthlyReports.period))
    .limit(limit)
    .offset(offset);
  return {
    items: rows.map(({ data, ...r }) => ({ ...r, periodLabel: periodLabel(r.period), headline: (data as MonthlyReportData).headline })),
  };
});
