import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deletePayslip, updatePayslip, visiblePayslip } from "@/lib/ops/payroll";
import { TEAM, authed, idParam, rawBody } from "@/lib/api/http";
import { payslipView } from "@/lib/api/payslips";

type Ctx = RouteContext<"/api/v1/payslips/[id]">;

async function nameOf(userId: string) {
  const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.name ?? null;
}

// Staff open only their own paid slips
export const GET = authed<Ctx>(async (user, _request, ctx) => {
  const slip = await visiblePayslip(user, idParam((await ctx.params).id));
  return payslipView(slip, await nameOf(slip.userId));
}, TEAM);

// { base, overtime, bonus, deductions, note? } on a draft; net is recalculated
export const PATCH = authed<Ctx>(async (user, request, ctx) => {
  const slip = await updatePayslip(user, idParam((await ctx.params).id), await rawBody(request));
  return payslipView(slip, await nameOf(slip.userId));
}, ["admin"]);

export const DELETE = authed<Ctx>(async (user, _request, ctx) => ({ period: await deletePayslip(user, idParam((await ctx.params).id)) }), ["admin"]);
