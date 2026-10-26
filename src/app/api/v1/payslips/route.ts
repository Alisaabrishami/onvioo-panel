import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parsePeriod, periodOf } from "@/lib/payroll";
import { ApiError, TEAM, authed, page, query, uuidParam } from "@/lib/api/http";
import { payslipView } from "@/lib/api/payslips";

// Admin: a month's slips (?period=1405-07, default this month; ?userId=).
// Staff: their own paid slips, newest first (?period= optional).
export const GET = authed(async (user, request) => {
  const { limit, offset } = page(request);
  const admin = user.role === "admin";
  const asked = query(request).get("period");
  if (asked && !parsePeriod(asked)) throw new ApiError(422, "invalid", "ماه را به‌صورت 1405-07 بفرستید");
  const period = asked ?? (admin ? periodOf() : null);
  const userId = admin ? uuidParam(request, "userId") : user.id;
  const rows = await db
    .select({ slip: schema.payslips, name: schema.users.name })
    .from(schema.payslips)
    .innerJoin(schema.users, eq(schema.users.id, schema.payslips.userId))
    .where(
      and(
        period ? eq(schema.payslips.period, period) : undefined,
        userId ? eq(schema.payslips.userId, userId) : undefined,
        admin ? undefined : eq(schema.payslips.status, "paid"),
      ),
    )
    .orderBy(desc(schema.payslips.period), schema.users.name)
    .limit(limit)
    .offset(offset);
  const items = rows.map((r) => payslipView(r.slip, r.name));
  return { period, items, total: items.reduce((s, p) => s + p.net, 0), unpaid: items.filter((p) => p.status === "draft").reduce((s, p) => s + p.net, 0) };
}, TEAM);
