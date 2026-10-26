"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import type { FormState } from "@/lib/forms";
import { invoiceLabel } from "@/lib/invoices-data";
import { PaymentUnavailableError, appUrl, requestPayment } from "@/lib/payment";

// Anyone holding the invoice link can pay it; nothing else is exposed
export async function startPayment(token: string): Promise<FormState> {
  if (!/^[\w-]{20,40}$/.test(token)) return { message: "لینک نامعتبر است" };
  const [inv] = await db
    .select({ invoice: schema.invoices, phone: schema.clients.phone })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(and(eq(schema.invoices.payToken, token), eq(schema.invoices.status, "sent")));
  if (!inv) return { message: "این فاکتور منتظر پرداخت نیست" };
  let url: string;
  try {
    const res = await requestPayment({
      amount: inv.invoice.total,
      description: `${invoiceLabel(inv.invoice.number)} Onvioo`,
      callbackUrl: `${appUrl()}/api/pay/callback?token=${token}`,
      mobile: inv.phone,
    });
    await db.insert(schema.invoicePayments).values({ invoiceId: inv.invoice.id, gateway: "zarinpal", amount: inv.invoice.total, authority: res.authority });
    url = res.url;
  } catch (error) {
    if (error instanceof PaymentUnavailableError) return { message: "پرداخت آنلاین هنوز فعال نشده است؛ لطفاً با Onvioo تماس بگیرید." };
    console.error("[pay] request failed", error);
    return { message: "اتصال به درگاه برقرار نشد؛ چند دقیقه بعد دوباره امتحان کنید." };
  }
  redirect(url);
}
