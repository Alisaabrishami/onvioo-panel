"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { AiUnavailableError } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { buildMonthlyReport } from "@/lib/monthly-report";
import { notifyClient } from "@/lib/notify";
import { parsePeriod, periodLabel, periodOf } from "@/lib/payroll";

function revalidateReports(id?: string) {
  revalidatePath("/reports");
  if (id) revalidatePath(`/reports/${id}`);
}

export async function generateReport(clientId: string, period: string): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(clientId) || !parsePeriod(period) || period >= periodOf()) return { message: "فقط برای ماه‌های تمام‌شده می‌شود گزارش ساخت" };
  try {
    const result = await buildMonthlyReport(clientId, period, user.id);
    if ("error" in result) return { message: result.error };
    await audit(user.id, "generate", "monthly_report", result.id, { period });
    revalidateReports(result.id);
    return { ok: true, message: "گزارش آماده شد" };
  } catch (error) {
    if (error instanceof AiUnavailableError) return { message: "کلید API هوش مصنوعی تنظیم نشده است" };
    console.error("monthly report failed", error);
    return { message: "ساختن گزارش ناموفق بود؛ دوباره امتحان کنید" };
  }
}

export async function saveReportNote(reportId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireTeam();
  if (!isUuid(reportId)) return { message: "پیدا نشد" };
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000) || null;
  const updated = await db
    .update(schema.monthlyReports)
    .set({ note, updatedAt: new Date() })
    .where(and(eq(schema.monthlyReports.id, reportId), isNull(schema.monthlyReports.sharedAt)))
    .returning({ id: schema.monthlyReports.id });
  if (!updated.length) return { message: "گزارش فرستاده‌شده دیگر قابل تغییر نیست" };
  revalidateReports(reportId);
  return { ok: true, message: "ذخیره شد" };
}

// Makes the report visible in the portal and tells the client by app, SMS and bot
export async function shareMonthlyReport(reportId: string): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(reportId)) return { message: "پیدا نشد" };
  const [report] = await db
    .update(schema.monthlyReports)
    .set({ sharedAt: new Date() })
    .where(and(eq(schema.monthlyReports.id, reportId), isNull(schema.monthlyReports.sharedAt)))
    .returning();
  if (!report) return { message: "این گزارش قبلاً فرستاده شده است" };
  await audit(user.id, "share", "monthly_report", reportId);
  await notifyClient(report.clientId, { title: `گزارش ${periodLabel(report.period)} شما آماده است`, href: `/portal/reports/${report.id}` }, { sms: true });
  revalidateReports(reportId);
  return { ok: true, message: "برای مشتری فرستاده شد" };
}
