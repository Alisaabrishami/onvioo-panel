import { eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { clientOptions, isUuid } from "@/lib/data";
import { isoDateToJalali } from "@/lib/format";
import { addDays, tehranDay } from "@/lib/growth";
import { getSetting } from "@/lib/settings";
import { createInvoice } from "../actions";
import { InvoiceForm } from "../invoice-form";

export const metadata: Metadata = { title: "فاکتور جدید" };

export default async function NewInvoicePage(props: PageProps<"/invoices/new">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const [clients, contracts, settings] = await Promise.all([
    clientOptions(),
    db.select({ id: schema.contracts.id, clientId: schema.contracts.clientId, title: schema.contracts.title, amount: schema.contracts.amount }).from(schema.contracts).where(ne(schema.contracts.status, "cancelled")),
    getSetting("payment"),
  ]);
  const today = tehranDay();
  // "Copy" starts from an earlier invoice, e.g. next month's bill
  const [from] = isUuid(sp.from) ? await db.select().from(schema.invoices).where(eq(schema.invoices.id, sp.from)) : [];
  const contract = isUuid(sp.contract) ? contracts.find((c) => c.id === sp.contract) : undefined;

  return (
    <>
      <PageHeader title="فاکتور جدید" />
      <Card className="max-w-4xl">
        <InvoiceForm
          action={createInvoice}
          clients={clients}
          contracts={contracts}
          submitLabel="ذخیره پیش‌نویس"
          initial={{
            clientId: from?.clientId ?? contract?.clientId ?? (isUuid(sp.client) ? sp.client : ""),
            contractId: from?.contractId ?? contract?.id ?? "",
            title: from?.title ?? contract?.title ?? "",
            rows: from
              ? from.items.map((i) => ({ title: i.title, qty: String(i.qty), price: String(i.unitPrice) }))
              : contract?.amount
                ? [{ title: contract.title, qty: "1", price: String(contract.amount) }]
                : [],
            discount: from ? String(from.discount) : "0",
            taxPct: String((from?.taxBp ?? settings.taxBp) / 100),
            issuedOn: isoDateToJalali(today),
            dueOn: settings.dueDays ? isoDateToJalali(addDays(today, settings.dueDays)) : "",
            note: from?.note ?? "",
          }}
        />
      </Card>
    </>
  );
}
