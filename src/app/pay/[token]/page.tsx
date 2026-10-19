import { and, desc, eq } from "drizzle-orm";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoice-document";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { db, schema } from "@/db";
import { formatToman } from "@/lib/format";
import { startPayment } from "../actions";
import { PayButton } from "../pay-button";

export const metadata: Metadata = { title: "پرداخت فاکتور", robots: { index: false } };

export default async function PayPage(props: PageProps<"/pay/[token]">) {
  const { token } = await props.params;
  const result = (await props.searchParams).result;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const [row] = await db
    .select({ invoice: schema.invoices, clientName: schema.clients.name })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(eq(schema.invoices.payToken, token));
  if (!row || row.invoice.status === "draft") notFound();
  const i = row.invoice;
  const [paid] = await db
    .select({ refId: schema.invoicePayments.refId })
    .from(schema.invoicePayments)
    .where(and(eq(schema.invoicePayments.invoiceId, i.id), eq(schema.invoicePayments.status, "paid")))
    .orderBy(desc(schema.invoicePayments.createdAt))
    .limit(1);

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 md:py-10">
      <div className="flex justify-center print:hidden"><Logo label="Onvioo" /></div>
      {result === "ok" && i.status === "paid" && (
        <Card className="flex items-center gap-3 border-mint/40 bg-mint/15">
          <CheckCircle2 className="size-6 shrink-0 text-success" />
          <p className="text-sm">پرداخت با موفقیت انجام شد{paid?.refId && <> · کد پیگیری <b dir="ltr">{paid.refId}</b></>}. ممنون از شما!</p>
        </Card>
      )}
      {(result === "failed" || result === "cancelled") && i.status === "sent" && (
        <Card className="flex items-center gap-3 border-coral/40 bg-coral/15">
          <XCircle className="size-6 shrink-0 text-danger" />
          <p className="text-sm">{result === "cancelled" ? "پرداخت لغو شد." : "پرداخت تأیید نشد."} اگر مبلغی از حساب شما کم شده، حداکثر تا ۷۲ ساعت برمی‌گردد. می‌توانید دوباره پرداخت کنید.</p>
        </Card>
      )}
      <InvoiceDocument doc={{ ...i, clientName: row.clientName, refId: paid?.refId }} />
      {i.status === "sent" && (
        <div className="print:hidden">
          <PayButton action={startPayment.bind(null, token)} label={`پرداخت آنلاین ${formatToman(i.total)}`} />
          <p className="mt-2 text-center text-xs text-muted-foreground">پرداخت امن از درگاه زرین‌پال با همه کارت‌های بانکی</p>
        </div>
      )}
      {i.status === "cancelled" && <p className="text-center text-sm text-muted-foreground">این فاکتور باطل شده است.</p>}
    </main>
  );
}
