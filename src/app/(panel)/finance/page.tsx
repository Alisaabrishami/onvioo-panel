import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { PeriodNav, readPeriod } from "@/components/period-nav";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { clientOptions } from "@/lib/data";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, partnerBalances, profitAndLoss } from "@/lib/finance";
import { balances, financeAccounts, partnerTransactions, partnersList, periodDayRange, profitBefore, transactionsBetween } from "@/lib/finance-data";
import { formatToman, isoDateToJalali, toPersianDigits } from "@/lib/format";
import { tehranDay } from "@/lib/growth";
import { periodLabel, periodOf, shiftPeriod } from "@/lib/payroll";
import { addTransaction, payRecurring } from "./actions";
import { TransactionForm } from "./forms";

export const metadata: Metadata = { title: "مالی" };

export default async function FinancePage(props: PageProps<"/finance">) {
  await requireAdmin();
  const current = periodOf();
  const period = readPeriod((await props.searchParams).period, current);
  const { from, to } = periodDayRange(period);
  const prev = periodDayRange(shiftPeriod(period, -1));
  const [txs, prevTxs, accounts, bal, partners, partnerTxs, allProfit, recurring, paidRecurring, clients] = await Promise.all([
    transactionsBetween(from, to),
    transactionsBetween(prev.from, prev.to),
    financeAccounts(),
    balances(),
    partnersList(),
    partnerTransactions(),
    profitBefore("9999-12-31"),
    db.select().from(schema.recurringExpenses).where(eq(schema.recurringExpenses.active, true)).orderBy(schema.recurringExpenses.dueDay),
    db
      .select({ id: schema.transactions.recurringId })
      .from(schema.transactions)
      .where(and(isNotNull(schema.transactions.recurringId), gte(schema.transactions.day, from), lt(schema.transactions.day, to))),
    clientOptions(),
  ]);
  const pl = profitAndLoss(txs);
  const prevPl = profitAndLoss(prevTxs);
  const partnerRows = partnerBalances(partners, partnerTxs, allProfit);
  const paid = new Set(paidRecurring.map((r) => r.id));
  const activeAccounts = accounts.filter((a) => a.active);
  const maxCat = Math.max(1, ...[...pl.byCategory.values()]);
  const today = isoDateToJalali(tehranDay());

  return (
    <>
      <PageHeader
        title="مالی"
        description="درآمد، هزینه و سود ماه؛ مستقل از حسابداری کافه"
        actions={<PeriodNav period={period} basePath="/finance" current={current} />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "درآمد", value: pl.income, prev: prevPl.income, tone: "text-success" },
          { label: "هزینه", value: pl.expense, prev: prevPl.expense, tone: "text-danger" },
          { label: "سود خالص", value: pl.profit, prev: prevPl.profit, tone: pl.profit >= 0 ? "text-primary" : "text-danger" },
        ].map((k) => (
          <Card key={k.label}>
            <p className="text-xs text-muted-foreground">{k.label} {periodLabel(period)}</p>
            <p className={`mt-1 text-2xl font-bold ${k.tone}`}>{formatToman(k.value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">ماه قبل: {formatToman(k.prev)}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">سود و زیان به تفکیک دسته</h2>
            {txs.length === 0 ? (
              <p className="text-sm text-muted-foreground">برای این ماه تراکنشی ثبت نشده است.</p>
            ) : (
              <div className="space-y-4">
                {[
                  { title: "درآمد", cats: INCOME_CATEGORIES, color: "bg-success" },
                  { title: "هزینه", cats: EXPENSE_CATEGORIES, color: "bg-danger" },
                ].map((g) => (
                  <div key={g.title} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{g.title}</p>
                    {g.cats.filter((c) => pl.byCategory.get(c)).map((c) => (
                      <div key={c} className="grid grid-cols-[8rem_1fr_7rem] items-center gap-3 text-sm">
                        <Link href={`/finance/transactions?period=${period}&category=${c}`} className="truncate hover:text-primary">{CATEGORY_LABELS[c]}</Link>
                        <div className="h-2 rounded-full bg-muted">
                          <div className={`h-2 rounded-full ${g.color}`} style={{ width: `${(pl.byCategory.get(c)! / maxCat) * 100}%` }} />
                        </div>
                        <span className="text-left font-medium">{formatToman(pl.byCategory.get(c)!)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {(pl.byCategory.get("partner_draw") || pl.byCategory.get("partner_contribution")) && (
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                    جابه‌جایی پول شرکا در سود حساب نمی‌شود: برداشت {formatToman(pl.byCategory.get("partner_draw") ?? 0)} · آورده {formatToman(pl.byCategory.get("partner_contribution") ?? 0)}
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">ثبت سریع تراکنش</h2>
            <TransactionForm action={addTransaction} accounts={activeAccounts.map((a) => ({ id: a.id, name: a.name }))} clients={clients} partners={partners.map((p) => ({ id: p.id, name: p.name }))} today={today} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">موجودی حساب‌ها</h2>
              <Link href="/finance/accounts" className="text-xs text-primary">مدیریت</Link>
            </div>
            {accounts.length === 0 ? (
              <EmptyState>هنوز حسابی نساخته‌اید. <Link href="/finance/accounts" className="text-primary">ساخت حساب</Link></EmptyState>
            ) : (
              <ul className="space-y-2 text-sm">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Link href={`/finance/accounts/${a.id}`} className="hover:text-primary">{a.name}</Link>
                    <span className="font-medium">{formatToman(bal.get(a.id) ?? 0)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                  <span>جمع</span>
                  <span>{formatToman([...bal.values()].reduce((s, v) => s + v, 0))}</span>
                </li>
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">هزینه‌های ثابت {periodLabel(period)}</h2>
              <Link href="/finance/recurring" className="text-xs text-primary">مدیریت</Link>
            </div>
            {recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">اجاره، اشتراک‌ها و قبض‌های ماهانه را در «هزینه‌های ثابت» تعریف کنید.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {recurring.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <div>
                      <p>{r.title}</p>
                      <p className="text-xs text-muted-foreground">{formatToman(r.amount)} · روز {toPersianDigits(r.dueDay)}</p>
                    </div>
                    {paid.has(r.id) ? (
                      <Badge tone="success">پرداخت شد</Badge>
                    ) : r.accountId ? (
                      <ActionButton action={payRecurring.bind(null, r.id, period)} pendingLabel="…" className="h-8 px-3 text-xs">
                        ثبت پرداخت
                      </ActionButton>
                    ) : (
                      <Badge tone="warning">حساب ندارد</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {partners.length > 0 && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">مانده شرکا</h2>
                <Link href="/finance/partners" className="text-xs text-primary">جزئیات</Link>
              </div>
              <ul className="space-y-2 text-sm">
                {partners.map((p) => {
                  const b = partnerRows.find((r) => r.id === p.id)!;
                  return (
                    <li key={p.id} className="flex items-center justify-between">
                      <span>{p.name} <span className="text-xs text-muted-foreground">({toPersianDigits(p.shareBp / 100)}٪)</span></span>
                      <span className={b.balance < 0 ? "font-medium text-danger" : "font-medium"}>{formatToman(b.balance)}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
