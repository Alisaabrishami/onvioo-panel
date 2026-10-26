import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, chipClass } from "@/components/ui";
import { db, schema } from "@/db";
import type { InvoiceStatus } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";
import { financeAccounts } from "@/lib/finance-data";
import { formatIsoDate, formatToman, toPersianDigits } from "@/lib/format";
import { tehranDay } from "@/lib/growth";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, isOverdue } from "@/lib/invoice";
import { periodDayRange } from "@/lib/finance-data";
import { periodOf } from "@/lib/payroll";
import { paymentDriver } from "@/lib/payment";
import { getSetting } from "@/lib/settings";
import { savePaymentSettings } from "./actions";
import { PaymentSettingsForm } from "./forms";

export const metadata: Metadata = { title: "فاکتورها" };

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "همه" },
  { key: "open", label: "منتظر پرداخت" },
  { key: "overdue", label: "سررسید گذشته" },
  { key: "draft", label: "پیش‌نویس" },
  { key: "paid", label: "پرداخت‌شده" },
];

export default async function InvoicesPage(props: PageProps<"/invoices">) {
  await requireAdmin();
  const filter = String((await props.searchParams).status ?? "");
  const today = tehranDay();
  const [rows, settings, accounts] = await Promise.all([
    db
      .select({ invoice: schema.invoices, clientName: schema.clients.name })
      .from(schema.invoices)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
      .orderBy(desc(schema.invoices.createdAt)),
    getSetting("payment"),
    financeAccounts(),
  ]);
  const month = periodDayRange(periodOf());
  const open = rows.filter((r) => r.invoice.status === "sent");
  const overdue = open.filter((r) => isOverdue(r.invoice, today));
  const paidThisMonth = rows.filter((r) => r.invoice.paidAt && tehranDay(r.invoice.paidAt) >= month.from);
  const shown = rows.filter(({ invoice: i }) =>
    filter === "open" ? i.status === "sent" : filter === "overdue" ? isOverdue(i, today) : filter ? i.status === (filter as InvoiceStatus) : true,
  );
  const driver = paymentDriver();

  return (
    <>
      <PageHeader
        title="فاکتورها"
        description="صدور فاکتور، لینک پرداخت آنلاین و ثبت خودکار در مالی"
        actions={
          <Link href="/invoices/new" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow transition-[filter,transform] hover:brightness-105 active:scale-[0.97]">
            <Plus className="size-4" />
            فاکتور جدید
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-muted-foreground">منتظر پرداخت ({toPersianDigits(open.length)})</p>
          <p className="mt-1 text-2xl font-bold">{formatToman(open.reduce((s, r) => s + r.invoice.total, 0))}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">سررسید گذشته ({toPersianDigits(overdue.length)})</p>
          <p className={`mt-1 text-2xl font-bold ${overdue.length ? "text-danger" : ""}`}>{formatToman(overdue.reduce((s, r) => s + r.invoice.total, 0))}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">دریافت‌شده این ماه</p>
          <p className="mt-1 text-2xl font-bold text-success">{formatToman(paidThisMonth.reduce((s, r) => s + r.invoice.total, 0))}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] [&>*]:min-w-0">
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <Link key={f.key} href={f.key ? `/invoices?status=${f.key}` : "/invoices"} className={chipClass(filter === f.key)}>{f.label}</Link>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyState>فاکتوری نیست.</EmptyState>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">شماره</th>
                    <th className="px-4 py-3 font-medium">فاکتور</th>
                    <th className="px-4 py-3 font-medium">مبلغ</th>
                    <th className="px-4 py-3 font-medium">مهلت</th>
                    <th className="px-4 py-3 font-medium">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map(({ invoice: i, clientName }) => (
                    <tr key={i.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-muted-foreground">{toPersianDigits(i.number ?? 0)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${i.id}`} className="font-medium hover:text-primary">{i.title}</Link>
                        <p className="text-xs text-muted-foreground">{clientName}</p>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatToman(i.total)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatIsoDate(i.dueOn) || "—"}</td>
                      <td className="px-4 py-3">
                        {isOverdue(i, today) ? <Badge tone="danger">سررسید گذشته</Badge> : <Badge tone={INVOICE_STATUS_TONES[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
        <Card className="h-fit space-y-3">
          <h2 className="font-semibold">تنظیمات پرداخت</h2>
          <p className="text-xs text-muted-foreground">
            {driver === "zarinpal"
              ? "درگاه زرین‌پال وصل است."
              : driver === "mock"
                ? "درگاه آزمایشی فعال است (پرداخت واقعی انجام نمی‌شود)."
                : "درگاه زرین‌پال هنوز وصل نیست؛ با کد مرچنت فعال می‌شود. تا آن موقع پرداخت‌ها را دستی ثبت کنید."}
          </p>
          <PaymentSettingsForm
            action={savePaymentSettings}
            accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
            initial={{ accountId: settings.accountId ?? "", taxPct: String(settings.taxBp / 100), dueDays: String(settings.dueDays) }}
          />
        </Card>
      </div>
    </>
  );
}
