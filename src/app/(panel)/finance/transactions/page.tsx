import { Lock, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PeriodNav, readPeriod } from "@/components/period-nav";
import { Badge, Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { db, schema } from "@/db";
import type { FinanceCategory } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";
import { clientOptions } from "@/lib/data";
import { CATEGORY_LABELS, signed } from "@/lib/finance";
import { financeAccounts, partnersList, periodDayRange, transactionsBetween } from "@/lib/finance-data";
import { formatIsoDate, formatToman, isoDateToJalali, toPersianDigits } from "@/lib/format";
import { tehranDay } from "@/lib/growth";
import { periodOf } from "@/lib/payroll";
import { addTransaction, deleteTransaction } from "../actions";
import { TransactionForm } from "../forms";
import { ReceiptCell } from "../receipt";

export const metadata: Metadata = { title: "تراکنش‌ها" };

export default async function TransactionsPage(props: PageProps<"/finance/transactions">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const current = periodOf();
  const period = readPeriod(sp.period, current);
  const accountId = typeof sp.account === "string" ? sp.account : "";
  const category = typeof sp.category === "string" && sp.category in CATEGORY_LABELS ? (sp.category as FinanceCategory) : "";
  const { from, to } = periodDayRange(period);
  const [all, accounts, clients, partners, bankLinked] = await Promise.all([
    transactionsBetween(from, to, accountId || undefined),
    financeAccounts(),
    clientOptions(),
    partnersList(),
    db.select({ id: schema.bankLines.transactionId }).from(schema.bankLines),
  ]);
  const txs = (category ? all.filter((t) => t.category === category) : all).reverse();
  const linked = new Set(bankLinked.map((b) => b.id));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const lockedThrough = new Map(accounts.map((a) => [a.id, a.lockedThrough]));
  const total = txs.reduce((s, t) => s + signed(t), 0);

  return (
    <>
      <PageHeader title="تراکنش‌ها" actions={<PeriodNav period={period} basePath="/finance/transactions" current={current} query={{ ...(accountId && { account: accountId }), ...(category && { category }) }} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <div className="space-y-4">
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="period" value={period} />
            <Select name="account" defaultValue={accountId} className="w-auto">
              <option value="">همه حساب‌ها</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <Select name="category" defaultValue={category} className="w-auto">
              <option value="">همه دسته‌ها</option>
              {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Button type="submit" variant="outline">فیلتر</Button>
          </form>
          {txs.length === 0 ? (
            <EmptyState>تراکنشی پیدا نشد.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 text-right font-medium">تاریخ</th>
                    <th className="px-3 py-3 text-right font-medium">شرح</th>
                    <th className="px-3 py-3 text-right font-medium">دسته</th>
                    <th className="px-3 py-3 text-right font-medium">حساب</th>
                    <th className="px-3 py-3 text-right font-medium">مبلغ</th>
                    <th className="px-3 py-3 text-right font-medium">رسید</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => {
                    const lock = lockedThrough.get(t.accountId);
                    const locked = !!lock && t.day <= lock;
                    return (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-3 py-2.5 whitespace-nowrap">{formatIsoDate(t.day)}</td>
                        <td className="px-3 py-2.5">
                          {t.description ?? "—"}
                          {t.clientId && <span className="text-xs text-muted-foreground"> · {clientName.get(t.clientId)}</span>}
                          {t.partnerId && <span className="text-xs text-muted-foreground"> · {partnerName.get(t.partnerId)}</span>}
                          {linked.has(t.id) && <Badge tone="success" className="mr-2">تطبیق با بانک</Badge>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{CATEGORY_LABELS[t.category]}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{accountName.get(t.accountId)}</td>
                        <td className={`px-3 py-2.5 whitespace-nowrap font-medium ${t.direction === "in" ? "text-success" : "text-danger"}`}>
                          {formatToman(signed(t))}
                        </td>
                        <td className="px-3 py-2.5">
                          <ReceiptCell transactionId={t.id} fileId={t.receiptFileId} />
                        </td>
                        <td className="px-3 py-2.5">
                          {locked ? (
                            <Lock className="size-4 text-muted-foreground" aria-label="دوره قفل است" />
                          ) : (
                            <form action={deleteTransaction.bind(null, t.id)}>
                              <button type="submit" className="rounded p-1 text-muted-foreground hover:text-danger" aria-label="حذف">
                                <Trash2 className="size-4" />
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className="px-3 py-2.5" colSpan={4}>جمع {toPersianDigits(txs.length)} تراکنش</td>
                    <td className="px-3 py-2.5" colSpan={3}>{formatToman(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">تراکنش تازه</h2>
          <TransactionForm
            action={addTransaction}
            accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
            clients={clients}
            partners={partners.map((p) => ({ id: p.id, name: p.name }))}
            today={isoDateToJalali(tehranDay())}
          />
          <p className="mt-4 text-xs text-muted-foreground">
            صورتحساب بانک را در <Link href="/finance/accounts" className="text-primary">حساب‌ها</Link> بارگذاری کنید تا سطرهای ثبت‌نشده را یک‌جا ببینید.
          </p>
        </Card>
      </div>
    </>
  );
}
