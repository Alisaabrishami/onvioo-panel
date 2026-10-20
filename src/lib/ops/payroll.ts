import "server-only";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { accountLocked } from "@/lib/finance-data";
import { notifyUsers } from "@/lib/notify";
import { minutesWithin, netPay, parsePeriod, periodDays, periodLabel, periodRange, suggestPay } from "@/lib/payroll";
import { activeTeam, deliveredItems, stretchesBetween, unpaidLeaveDays } from "@/lib/team-data";
import { type Actor, OpsError, conflict, fieldError, missing, parseInput } from "./errors";

// Payslips: drafted from hours, deliveries and leave, adjusted by the admin,
// then paid as a salary expense. Shared by the panel and the mobile API.

function adminOnly(actor: Actor) {
  if (actor.role !== "admin") throw new OpsError("forbidden", "این کار فقط با مدیر است", 403);
}

function revalidatePayroll(id?: string) {
  revalidatePath("/payroll");
  if (id) revalidatePath(`/payroll/${id}`);
  revalidatePath("/finance", "layout");
}

// Staff see only their own slips, and only once paid
export async function visiblePayslip(actor: Actor, id: string) {
  if (actor.role === "client") throw new OpsError("forbidden", "این بخش برای حساب شما نیست", 403);
  const [slip] = await db.select().from(schema.payslips).where(eq(schema.payslips.id, id));
  if (!slip || (actor.role !== "admin" && (slip.userId !== actor.id || slip.status !== "paid"))) throw missing("فیش پیدا نشد");
  return slip;
}

// Drafts for everyone with a pay rate; existing drafts are recalculated
// from the latest hours and deliveries, keeping bonuses and notes
export async function generatePayslips(actor: Actor, period: string): Promise<number> {
  adminOnly(actor);
  if (!parsePeriod(period)) throw fieldError("period", "ماه را به‌صورت ۱۴۰۵-۰۷ بفرستید");
  const { start, end } = periodRange(period);
  const now = new Date();
  const [team, stretches, delivered, unpaid, existing] = await Promise.all([
    activeTeam(),
    stretchesBetween(start, end),
    deliveredItems(start, end),
    unpaidLeaveDays(period),
    db.select().from(schema.payslips).where(eq(schema.payslips.period, period)),
  ]);
  let made = 0;
  for (const m of team) {
    if (!m.payType || !m.rate) continue;
    const prior = existing.find((p) => p.userId === m.id);
    if (prior?.status === "paid") continue;
    const workedMinutes = minutesWithin(stretches.filter((s) => s.userId === m.id), start, end, now);
    const items = delivered.filter((d) => d.userId === m.id).length;
    const pay = suggestPay({ payType: m.payType, rate: m.rate, workedMinutes, items, unpaidDays: unpaid.get(m.id), daysInMonth: periodDays(period) });
    const bonus = prior?.bonus ?? 0;
    const values = {
      payType: m.payType,
      rate: m.rate,
      workedMinutes,
      items,
      base: pay.base,
      overtime: pay.overtime,
      deductions: pay.deductions,
      bonus,
      net: netPay({ ...pay, bonus }),
    };
    if (prior) await db.update(schema.payslips).set(values).where(eq(schema.payslips.id, prior.id));
    else await db.insert(schema.payslips).values({ userId: m.id, period, createdBy: actor.id, ...values });
    made++;
  }
  await audit(actor.id, "generate", "payslips", undefined, { period, count: made });
  revalidatePayroll();
  return made;
}

const amount = (label: string) => z.number({ error: `${label} را با عدد بفرستید` }).int().nonnegative({ error: `${label} منفی نمی‌شود` });

export const payslipInput = z.object({
  base: amount("پایه"),
  overtime: amount("اضافه‌کار"),
  bonus: amount("پاداش"),
  deductions: amount("کسورات"),
  note: z.string().trim().max(2000).nullable().optional().transform((v) => v || null),
});

export async function updatePayslip(actor: Actor, id: string, raw: unknown) {
  adminOnly(actor);
  const { note, ...fields } = parseInput(payslipInput, raw);
  const [updated] = await db
    .update(schema.payslips)
    .set({ ...fields, note, net: netPay(fields) })
    .where(and(eq(schema.payslips.id, id), eq(schema.payslips.status, "draft")))
    .returning();
  if (!updated) {
    await visiblePayslip(actor, id);
    throw conflict("فیش پرداخت‌شده قابل تغییر نیست");
  }
  await audit(actor.id, "update", "payslip", id);
  revalidatePayroll(id);
  return updated;
}

export const payInput = z.object({
  accountId: z.uuid({ error: "حساب پرداخت را انتخاب کنید" }),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "تاریخ پرداخت را وارد کنید" }),
});

// Paying records the salary as an expense from the chosen account
export async function payPayslip(actor: Actor, id: string, raw: unknown) {
  adminOnly(actor);
  const { accountId, day } = parseInput(payInput, raw);
  const [account] = await db.select({ active: schema.financeAccounts.active }).from(schema.financeAccounts).where(eq(schema.financeAccounts.id, accountId));
  if (!account?.active) throw fieldError("accountId", "حساب پرداخت پیدا نشد");
  if (await accountLocked(accountId, day)) throw fieldError("day", "این تاریخ در دوره قفل‌شده حساب است");

  const slip = await db.transaction(async (tx) => {
    const [paid] = await tx
      .update(schema.payslips)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(schema.payslips.id, id), eq(schema.payslips.status, "draft")))
      .returning();
    if (!paid) return null;
    const [person] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, paid.userId));
    await tx.insert(schema.transactions).values({
      accountId,
      day,
      direction: "out",
      amount: paid.net,
      category: "salary",
      description: `حقوق ${periodLabel(paid.period)} ${person?.name ?? ""}`.trim(),
      payslipId: paid.id,
      createdBy: actor.id,
    });
    return paid;
  });
  if (!slip) {
    await visiblePayslip(actor, id);
    throw conflict("این فیش قبلاً پرداخت شده است");
  }
  await audit(actor.id, "pay", "payslip", id, { net: slip.net });
  await notifyUsers([slip.userId], { title: `فیش حقوق ${periodLabel(slip.period)} آماده است`, href: `/payroll/${id}` });
  revalidatePayroll(id);
  return slip;
}

export async function deletePayslip(actor: Actor, id: string): Promise<string> {
  adminOnly(actor);
  const [deleted] = await db
    .delete(schema.payslips)
    .where(and(eq(schema.payslips.id, id), eq(schema.payslips.status, "draft")))
    .returning({ period: schema.payslips.period });
  if (!deleted) {
    await visiblePayslip(actor, id);
    throw conflict("فیش پرداخت‌شده حذف نمی‌شود");
  }
  await audit(actor.id, "delete", "payslip", id);
  revalidatePayroll();
  return deleted.period;
}
