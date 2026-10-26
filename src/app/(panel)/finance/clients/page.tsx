import type { Metadata } from "next";
import Link from "next/link";
import { PeriodNav, readPeriod } from "@/components/period-nav";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { periodDayRange, transactionsBetween } from "@/lib/finance-data";
import { formatToman, toPersianDigits } from "@/lib/format";
import { formatMinutes, periodLabel, periodOf } from "@/lib/payroll";
import { laborCostByClient } from "@/lib/team-data";

export const metadata: Metadata = { title: "سودآوری مشتری‌ها" };

export default async function ClientProfitPage(props: PageProps<"/finance/clients">) {
  await requireAdmin();
  const current = periodOf();
  const period = readPeriod((await props.searchParams).period, current);
  const { from, to } = periodDayRange(period);
  const [txs, labor, clients] = await Promise.all([
    transactionsBetween(from, to),
    laborCostByClient(period),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients),
  ]);
  const income = new Map<string, number>();
  let unassigned = 0;
  for (const t of txs) {
    if (t.category !== "client_payment") continue;
    if (t.clientId) income.set(t.clientId, (income.get(t.clientId) ?? 0) + t.amount);
    else unassigned += t.amount;
  }
  const rows = clients
    .map((c) => {
      const inc = income.get(c.id) ?? 0;
      const l = labor.get(c.id) ?? { minutes: 0, cost: 0 };
      const cost = Math.round(l.cost);
      return { ...c, income: inc, cost, minutes: l.minutes, profit: inc - cost, margin: inc ? (inc - cost) / inc : null };
    })
    .filter((r) => r.income || r.cost || r.minutes)
    .sort((a, b) => b.profit - a.profit);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.max(r.income, r.cost)));

  return (
    <>
      <PageHeader
        title="سودآوری مشتری‌ها"
        description="دریافتی از هر مشتری منهای هزینه ساعت‌هایی که تیم روی او گذاشته"
        actions={<PeriodNav period={period} basePath="/finance/clients" current={current} />}
      />
      {rows.length === 0 ? (
        <EmptyState>
          برای {periodLabel(period)} نه دریافتی به نام مشتری ثبت شده نه ساعت کاری. موقع ورود به کار در «حضور و مرخصی» مشتری را انتخاب کنید تا هزینه به حساب او برود.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="grid gap-3 sm:grid-cols-[12rem_1fr_10rem] sm:items-center">
              <div>
                <Link href={`/clients/${r.id}`} className="font-semibold hover:text-primary">{r.name}</Link>
                <p className="text-xs text-muted-foreground">{formatMinutes(r.minutes)} ساعت کار تیم</p>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-12 text-muted-foreground">دریافتی</span>
                  <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-success" style={{ width: `${(r.income / maxAbs) * 100}%` }} /></div>
                  <span className="w-28 text-left">{formatToman(r.income)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-muted-foreground">هزینه</span>
                  <div className="h-2 flex-1 rounded-full bg-muted"><div className="h-2 rounded-full bg-danger" style={{ width: `${(r.cost / maxAbs) * 100}%` }} /></div>
                  <span className="w-28 text-left">{formatToman(r.cost)}</span>
                </div>
              </div>
              <div className="sm:text-left">
                <p className={`text-lg font-bold ${r.profit < 0 ? "text-danger" : "text-success"}`}>{formatToman(r.profit)}</p>
                <p className="text-xs text-muted-foreground">{r.margin == null ? "بدون دریافتی" : `حاشیه سود ${toPersianDigits(Math.round(r.margin * 100))}٪`}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        هزینه هر ساعت از روی حقوق هر نفر حساب می‌شود (ماهانه‌بگیرها حقوق تقسیم بر ۱۷۶ ساعت) و کارمزدی‌ها به ازای هر کار تحویل‌شده. هزینه‌های عمومی مثل اجاره اینجا تقسیم نمی‌شوند.
        {unassigned > 0 && ` ${formatToman(unassigned)} دریافتی این ماه به مشتری خاصی وصل نشده است.`}
      </p>
    </>
  );
}
