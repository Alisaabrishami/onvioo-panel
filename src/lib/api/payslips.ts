import "server-only";
import type { schema } from "@/db";
import { periodLabel } from "@/lib/payroll";
import { appLink } from "@/lib/bot";
import { PAY_TYPE_LABELS } from "@/app/(panel)/staff/labels";

type Payslip = typeof schema.payslips.$inferSelect;

export function payslipView(slip: Payslip, name?: string | null) {
  return {
    ...slip,
    name: name ?? null,
    periodLabel: periodLabel(slip.period),
    payTypeLabel: PAY_TYPE_LABELS[slip.payType],
    statusLabel: slip.status === "paid" ? "پرداخت شده" : "پیش‌نویس",
    pdfUrl: appLink(`/payroll/${slip.id}`),
  };
}
