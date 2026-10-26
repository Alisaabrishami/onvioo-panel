import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { paymentAccountId, settleInvoice } from "@/lib/invoices-data";
import { appUrl, verifyPayment } from "@/lib/payment";

// The gateway sends the payer back here with ?Authority=…&Status=OK|NOK
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const authority = url.searchParams.get("Authority") ?? "";
  const back = (result: string) => Response.redirect(`${appUrl()}/pay/${encodeURIComponent(token)}?result=${result}`, 303);
  if (!/^[\w-]{20,40}$/.test(token) || !authority) return back("failed");

  const [row] = await db
    .select({ payment: schema.invoicePayments, invoice: schema.invoices })
    .from(schema.invoicePayments)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoicePayments.invoiceId))
    .where(and(eq(schema.invoicePayments.authority, authority), eq(schema.invoices.payToken, token)));
  if (!row) return back("failed");
  if (row.payment.status === "paid") return back("ok");

  if (url.searchParams.get("Status") !== "OK") {
    await db.update(schema.invoicePayments).set({ status: "failed", error: "cancelled", completedAt: new Date() }).where(eq(schema.invoicePayments.id, row.payment.id));
    return back("cancelled");
  }
  const v = await verifyPayment({ amount: row.payment.amount, authority }).catch((error) => {
    console.error("[pay] verify failed", error);
    return { ok: false, refId: null, cardPan: null, error: String(error).slice(0, 200) };
  });
  if (!v.ok) {
    await db.update(schema.invoicePayments).set({ status: "failed", error: v.error, completedAt: new Date() }).where(eq(schema.invoicePayments.id, row.payment.id));
    return back("failed");
  }
  await db
    .update(schema.invoicePayments)
    .set({ status: "paid", refId: v.refId, cardPan: v.cardPan, completedAt: new Date() })
    .where(eq(schema.invoicePayments.id, row.payment.id));
  await settleInvoice(row.invoice.id, { accountId: await paymentAccountId(), reference: v.refId, online: true });
  return back("ok");
}
