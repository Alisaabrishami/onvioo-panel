import { and, desc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { startPayment } from "@/app/pay/actions";
import { PayButton } from "@/app/pay/pay-button";
import { requireClient } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { formatToman } from "@/lib/format";

export const metadata: Metadata = { title: "فاکتور" };

export default async function PortalInvoice(props: PageProps<"/portal/invoices/[id]">) {
  const user = await requireClient();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ invoice: schema.invoices, clientName: schema.clients.name })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.clientId, user.clientId), ne(schema.invoices.status, "draft")));
  if (!row) notFound();
  const i = row.invoice;
  const [paid] = await db
    .select({ refId: schema.invoicePayments.refId })
    .from(schema.invoicePayments)
    .where(and(eq(schema.invoicePayments.invoiceId, i.id), eq(schema.invoicePayments.status, "paid")))
    .orderBy(desc(schema.invoicePayments.createdAt))
    .limit(1);
  return (
    <>
      <PageHeader title={i.title} actions={<PrintButton />} />
      <div className="space-y-5">
        <InvoiceDocument doc={{ ...i, clientName: row.clientName, refId: paid?.refId }} />
        {i.status === "sent" && (
          <div className="print:hidden">
            <PayButton action={startPayment.bind(null, i.payToken)} label={`پرداخت آنلاین ${formatToman(i.total)}`} />
          </div>
        )}
      </div>
    </>
  );
}
