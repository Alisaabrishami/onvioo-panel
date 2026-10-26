import type { InvoiceItem, InvoiceStatus } from "@/db/schema";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "پیش‌نویس",
  sent: "ارسال‌شده",
  paid: "پرداخت‌شده",
  cancelled: "باطل",
};

export const INVOICE_STATUS_TONES = {
  draft: "neutral",
  sent: "info",
  paid: "success",
  cancelled: "dark",
} as const;

// Subtotal, VAT on the discounted amount, and the total, all in whole toman
export function invoiceTotals(items: InvoiceItem[], discount: number, taxBp: number) {
  const subtotal = items.reduce((s, i) => s + Math.round(i.qty * i.unitPrice), 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round((taxable * taxBp) / 10000);
  return { subtotal, taxable, tax, total: taxable + tax };
}

export function isOverdue(inv: { status: InvoiceStatus; dueOn: string | null }, today: string): boolean {
  return inv.status === "sent" && !!inv.dueOn && inv.dueOn < today;
}

// Items arrive from a form as parallel arrays; blank rows are dropped
export function readItems(titles: string[], qtys: (number | null)[], prices: (number | null)[]): InvoiceItem[] | string {
  const items: InvoiceItem[] = [];
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i]?.trim() ?? "";
    const qty = qtys[i];
    const unitPrice = prices[i];
    if (!title && !unitPrice) continue;
    if (!title) return `ردیف ${i + 1}: شرح را بنویسید`;
    if (unitPrice == null || Number.isNaN(unitPrice) || unitPrice <= 0) return `ردیف ${i + 1}: مبلغ نامعتبر`;
    if (qty == null || Number.isNaN(qty) || qty <= 0) return `ردیف ${i + 1}: تعداد نامعتبر`;
    items.push({ title, qty, unitPrice });
  }
  return items.length ? items : "حداقل یک ردیف لازم است";
}
