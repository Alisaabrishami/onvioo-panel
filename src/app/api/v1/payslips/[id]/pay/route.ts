import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { payPayslip } from "@/lib/ops/payroll";
import { authed, idParam, rawBody } from "@/lib/api/http";
import { payslipView } from "@/lib/api/payslips";

// { accountId, day: "2026-10-20" }: records the salary as an expense and tells the employee
export const POST = authed<RouteContext<"/api/v1/payslips/[id]/pay">>(async (user, request, ctx) => {
  const slip = await payPayslip(user, idParam((await ctx.params).id), await rawBody(request));
  const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, slip.userId));
  return payslipView(slip, u?.name);
}, ["admin"]);
