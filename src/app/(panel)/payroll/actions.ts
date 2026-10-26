"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, typedValues } from "@/lib/forms";
import { jalaliToIsoDate, toPersianDigits } from "@/lib/format";
import { parseCount } from "@/lib/growth";
import { opsFormState } from "@/lib/ops/errors";
import * as ops from "@/lib/ops/payroll";

export async function generatePayslips(period: string): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    const made = await ops.generatePayslips(admin, period);
    return { ok: true, message: made ? `${toPersianDigits(made)} فیش آماده شد` : "کسی با نرخ حقوق ثبت‌شده پیدا نشد؛ نرخ را در صفحه کارکنان وارد کنید." };
  } catch (error) {
    return opsFormState(error);
  }
}

const money = (formData: FormData, key: string) => parseCount(String(formData.get(key) ?? "")) ?? 0;

export async function updatePayslip(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const fields = { base: money(formData, "base"), overtime: money(formData, "overtime"), bonus: money(formData, "bonus"), deductions: money(formData, "deductions") };
  const bad = Object.entries(fields).filter(([, v]) => Number.isNaN(v)).map(([k]) => k);
  if (bad.length) return { errors: Object.fromEntries(bad.map((k) => [k, ["عدد نامعتبر"]])), values: typedValues(formData) };
  try {
    await ops.updatePayslip(admin, id, {
      ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Math.round(v)])),
      note: String(formData.get("note") ?? ""),
    });
    return { ok: true, message: "ذخیره شد" };
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
}

// Paying records the salary as an expense from the chosen account
export async function payPayslip(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  try {
    await ops.payPayslip(admin, id, { accountId: String(formData.get("accountId") ?? ""), day: jalaliToIsoDate(String(formData.get("day") ?? "")) ?? "" });
    return { ok: true, message: "پرداخت ثبت شد" };
  } catch (error) {
    return opsFormState(error);
  }
}

export async function deletePayslip(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  let period: string;
  try {
    period = await ops.deletePayslip(admin, id);
  } catch (error) {
    opsFormState(error);
    return;
  }
  redirect(`/payroll?period=${period}`);
}
