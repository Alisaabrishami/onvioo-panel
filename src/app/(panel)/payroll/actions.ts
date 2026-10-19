"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { jalaliToIsoDate, toPersianDigits } from "@/lib/format";
import { parseCount } from "@/lib/growth";
import { notifyUsers } from "@/lib/notify";
import { minutesWithin, netPay, parsePeriod, periodDays, periodLabel, periodRange, suggestPay } from "@/lib/payroll";
import { activeTeam, deliveredItems, stretchesBetween, unpaidLeaveDays } from "@/lib/team-data";
import { accountLocked } from "@/lib/finance-data";

function revalidatePayroll(id?: string) {
  revalidatePath("/payroll");
  if (id) revalidatePath(`/payroll/${id}`);
  revalidatePath("/finance", "layout");
}

// Drafts for everyone with a pay rate; existing drafts are recalculated
// from the latest hours and deliveries, keeping bonuses and notes
export async function generatePayslips(period: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (!parsePeriod(period)) return { message: "ماه نامعتبر" };
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
    else await db.insert(schema.payslips).values({ userId: m.id, period, createdBy: admin.id, ...values });
    made++;
  }
  await audit(admin.id, "generate", "payslips", undefined, { period, count: made });
  revalidatePayroll();
  return { ok: true, message: made ? `${toPersianDigits(made)} فیش آماده شد` : "کسی با نرخ حقوق ثبت‌شده پیدا نشد؛ نرخ را در صفحه کارکنان وارد کنید." };
}

const money = (formData: FormData, key: string) => parseCount(String(formData.get(key) ?? "")) ?? 0;

export async function updatePayslip(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const fields = { base: money(formData, "base"), overtime: money(formData, "overtime"), bonus: money(formData, "bonus"), deductions: money(formData, "deductions") };
  const bad = Object.entries(fields).filter(([, v]) => Number.isNaN(v)).map(([k]) => k);
  if (bad.length) return { errors: Object.fromEntries(bad.map((k) => [k, ["عدد نامعتبر"]])), values: Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])) };
  const note = String(formData.get("note") ?? "").trim() || null;
  const updated = await db
    .update(schema.payslips)
    .set({ ...fields, note, net: netPay(fields) })
    .where(and(eq(schema.payslips.id, id), eq(schema.payslips.status, "draft")))
    .returning({ id: schema.payslips.id });
  if (!updated.length) return { message: "فیش پرداخت‌شده قابل تغییر نیست" };
  await audit(admin.id, "update", "payslip", id);
  revalidatePayroll(id);
  return { ok: true, message: "ذخیره شد" };
}

// Paying records the salary as an expense from the chosen account
export async function payPayslip(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const accountId = String(formData.get("accountId") ?? "");
  const day = jalaliToIsoDate(String(formData.get("day") ?? ""));
  if (!isUuid(accountId)) return { errors: { accountId: ["حساب پرداخت را انتخاب کنید"] } };
  if (!day) return { errors: { day: ["تاریخ پرداخت را وارد کنید"] } };
  if (await accountLocked(accountId, day)) return { errors: { day: ["این تاریخ در دوره قفل‌شده حساب است"] } };

  const result = await db.transaction(async (tx) => {
    const [slip] = await tx
      .update(schema.payslips)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(schema.payslips.id, id), eq(schema.payslips.status, "draft")))
      .returning();
    if (!slip) return null;
    const [person] = await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, slip.userId));
    await tx.insert(schema.transactions).values({
      accountId,
      day,
      direction: "out",
      amount: slip.net,
      category: "salary",
      description: `حقوق ${periodLabel(slip.period)} ${person?.name ?? ""}`.trim(),
      payslipId: slip.id,
      createdBy: admin.id,
    });
    return slip;
  });
  if (!result) return { message: "این فیش قبلاً پرداخت شده است" };
  await audit(admin.id, "pay", "payslip", id, { net: result.net });
  await notifyUsers([result.userId], { title: `فیش حقوق ${periodLabel(result.period)} آماده است`, href: `/payroll/${id}` });
  revalidatePayroll(id);
  return { ok: true, message: "پرداخت ثبت شد" };
}

export async function deletePayslip(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  const [deleted] = await db
    .delete(schema.payslips)
    .where(and(eq(schema.payslips.id, id), eq(schema.payslips.status, "draft")))
    .returning({ period: schema.payslips.period });
  if (!deleted) return;
  await audit(admin.id, "delete", "payslip", id);
  revalidatePayroll();
  redirect(`/payroll?period=${deleted.period}`);
}
