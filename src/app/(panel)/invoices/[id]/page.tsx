import { desc, eq, ne } from "drizzle-orm";
import { Bell, Copy as CopyIcon, Trash2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { clientOptions, isUuid } from "@/lib/data";
import { financeAccounts } from "@/lib/finance-data";
import { formatJalaliDateTime, formatToman, isoDateToJalali } from "@/lib/format";
import { tehranDay } from "@/lib/growth";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, isOverdue } from "@/lib/invoice";
import { appUrl } from "@/lib/payment";
import { cancelInvoice, deleteInvoice, markPaid, remindInvoice, updateInvoice } from "../actions";
import { CopyLink, MarkPaidForm } from "../forms";
import { InvoiceForm } from "../invoice-form";

export const metadata: Metadata = { title: "فاکتور" };

export default async function InvoicePage(props: PageProps<"/invoices/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ invoice: schema.invoices, clientName: schema.clients.name })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(eq(schema.invoices.id, id));
  if (!row) notFound();
  const i = row.invoice;
  const [payments, accounts] = await Promise.all([
    db.select().from(schema.invoicePayments).where(eq(schema.invoicePayments.invoiceId, id)).orderBy(desc(schema.invoicePayments.createdAt)),
    financeAccounts(),
  ]);
  const paidOnline = payments.find((p) => p.status === "paid");
  const payUrl = `${appUrl()}/pay/${i.payToken}`;
  const today = tehranDay();

  if (i.status === "draft") {
    const [clients, contracts] = await Promise.all([
      clientOptions(),
      db.select({ id: schema.contracts.id, clientId: schema.contracts.clientId, title: schema.contracts.title, amount: schema.contracts.amount }).from(schema.contracts).where(ne(schema.contracts.status, "cancelled")),
    ]);
    return (
      <>
        <PageHeader title={i.title} description={`پیش‌نویس · ${row.clientName}`} actions={<Badge>پیش‌نویس</Badge>} />
        <Card className="max-w-4xl">
          <InvoiceForm
            action={updateInvoice.bind(null, i.id)}
            clients={clients}
            contracts={contracts}
            submitLabel="ذخیره پیش‌نویس"
            initial={{
              clientId: i.clientId,
              contractId: i.contractId ?? "",
              title: i.title,
              rows: i.items.map((it) => ({ title: it.title, qty: String(it.qty), price: String(it.unitPrice) })),
              discount: String(i.discount),
              taxPct: String(i.taxBp / 100),
              issuedOn: isoDateToJalali(i.issuedOn),
              dueOn: isoDateToJalali(i.dueOn),
              note: i.note ?? "",
            }}
          />
        </Card>
        <form action={deleteInvoice.bind(null, i.id)} className="mt-4">
          <Button type="submit" variant="ghost" className="text-muted-foreground hover:text-danger"><Trash2 className="size-4" />حذف پیش‌نویس</Button>
        </form>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={i.title}
        description={row.clientName}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {isOverdue(i, today) ? <Badge tone="danger">سررسید گذشته</Badge> : <Badge tone={INVOICE_STATUS_TONES[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>}
            <Link href={`/invoices/new?from=${i.id}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-3.5 text-sm hover:bg-muted">
              <CopyIcon className="size-4" />کپی برای فاکتور بعدی
            </Link>
            <PrintButton />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <InvoiceDocument doc={{ ...i, clientName: row.clientName, refId: paidOnline?.refId }} />
        <div className="space-y-4 print:hidden">
          {i.status === "sent" && (
            <>
              <Card className="space-y-3">
                <h2 className="font-semibold">لینک پرداخت</h2>
                <p className="text-xs text-muted-foreground">
                  {i.sentAt && `ارسال‌شده در ${formatJalaliDateTime(i.sentAt)}. `}
                  مشتری بدون ورود به پنل هم با این لینک می‌تواند پرداخت کند.
                  {i.remindedAt && ` آخرین یادآوری: ${formatJalaliDateTime(i.remindedAt)}`}
                </p>
                <CopyLink url={payUrl} />
                <ActionButton action={remindInvoice.bind(null, i.id)} pendingLabel="در حال ارسال…"><Bell className="size-4" />یادآوری با پیامک</ActionButton>
              </Card>
              <Card className="space-y-3">
                <h2 className="font-semibold">پرداخت کارت‌به‌کارت یا نقدی</h2>
                <MarkPaidForm action={markPaid.bind(null, i.id)} accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))} today={isoDateToJalali(today)} />
              </Card>
              <form action={cancelInvoice.bind(null, i.id)}>
                <Button type="submit" variant="ghost" className="text-muted-foreground hover:text-danger"><XCircle className="size-4" />باطل کردن فاکتور</Button>
              </form>
            </>
          )}
          {i.status === "paid" && (
            <Card className="space-y-2 text-sm">
              <h2 className="font-semibold">پرداخت</h2>
              <p>{formatToman(i.total)} {paidOnline ? `آنلاین · کد پیگیری ${paidOnline.refId ?? "—"}` : "ثبت دستی"}</p>
              {i.transactionId ? (
                <Link href="/finance/transactions" className="text-primary">در تراکنش‌های مالی ثبت شد</Link>
              ) : (
                <p className="text-danger">حساب دریافت تعیین نشده بود؛ این مبلغ در مالی ثبت نشد.</p>
              )}
            </Card>
          )}
          {payments.length > 0 && (
            <Card className="space-y-2 text-sm">
              <h2 className="font-semibold">تلاش‌های پرداخت آنلاین</h2>
              <ul className="space-y-1.5 text-xs">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{formatJalaliDateTime(p.createdAt)}</span>
                    <Badge tone={p.status === "paid" ? "success" : p.status === "failed" ? "danger" : "neutral"}>
                      {p.status === "paid" ? "موفق" : p.status === "failed" ? "ناموفق" : "نیمه‌کاره"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
