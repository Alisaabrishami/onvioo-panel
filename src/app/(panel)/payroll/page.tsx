import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { PeriodNav, readPeriod } from "@/components/period-nav";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { formatToman, toPersianDigits } from "@/lib/format";
import { formatMinutes, periodLabel, periodOf } from "@/lib/payroll";
import { PAY_TYPE_LABELS } from "../staff/labels";
import { generatePayslips } from "./actions";

export const metadata: Metadata = { title: "حقوق" };

export default async function PayrollPage(props: PageProps<"/payroll">) {
  const user = await requireTeam();
  if (user.role !== "admin") return <MyPayslips userId={user.id} />;
  const current = periodOf();
  const period = readPeriod((await props.searchParams).period, current);
  const slips = await db
    .select({ slip: schema.payslips, name: schema.users.name })
    .from(schema.payslips)
    .innerJoin(schema.users, eq(schema.users.id, schema.payslips.userId))
    .where(eq(schema.payslips.period, period))
    .orderBy(schema.users.name);
  const total = slips.reduce((s, r) => s + r.slip.net, 0);
  const unpaid = slips.filter((r) => r.slip.status === "draft").reduce((s, r) => s + r.slip.net, 0);

  return (
    <>
      <PageHeader
        title="حقوق"
        description="فیش‌ها از روی ساعت کاری، کارهای تحویل‌شده و مرخصی‌ها ساخته می‌شوند"
        actions={<PeriodNav period={period} basePath="/payroll" current={current} />}
      />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <dl className="flex gap-8">
          <div>
            <dt className="text-xs text-muted-foreground">جمع حقوق {periodLabel(period)}</dt>
            <dd className="text-xl font-bold">{formatToman(total)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">پرداخت‌نشده</dt>
            <dd className="text-xl font-bold text-warning">{formatToman(unpaid)}</dd>
          </div>
        </dl>
        <ActionButton action={generatePayslips.bind(null, period)} pendingLabel="در حال محاسبه…" variant="primary">
          {slips.length ? "محاسبه دوباره پیش‌نویس‌ها" : "ساخت فیش‌های این ماه"}
        </ActionButton>
      </Card>
      {slips.length === 0 ? (
        <EmptyState>برای {periodLabel(period)} هنوز فیشی ساخته نشده است.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-medium">نفر</th>
                <th className="px-4 py-3 text-right font-medium">نوع</th>
                <th className="px-4 py-3 text-right font-medium">ساعت / کار</th>
                <th className="px-4 py-3 text-right font-medium">خالص</th>
                <th className="px-4 py-3 text-right font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {slips.map(({ slip: s, name }) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/payroll/${s.id}`} className="font-medium hover:text-primary">{name}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{PAY_TYPE_LABELS[s.payType]}</td>
                  <td className="px-4 py-3">
                    {formatMinutes(s.workedMinutes)}
                    {s.items > 0 && <span className="text-muted-foreground"> · {toPersianDigits(s.items)} کار</span>}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatToman(s.net)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.status === "paid" ? "success" : "warning"}>{s.status === "paid" ? "پرداخت شد" : "پیش‌نویس"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Staff: their own paid slips, newest first
async function MyPayslips({ userId }: { userId: string }) {
  const slips = await db
    .select()
    .from(schema.payslips)
    .where(and(eq(schema.payslips.userId, userId), eq(schema.payslips.status, "paid")))
    .orderBy(desc(schema.payslips.period));
  return (
    <>
      <PageHeader title="فیش‌های حقوق من" description="هر فیش بعد از پرداخت اینجا می‌آید و قابل چاپ است" />
      {slips.length === 0 ? (
        <EmptyState>هنوز فیش پرداخت‌شده‌ای ندارید.</EmptyState>
      ) : (
        <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slips.map((s) => (
            <li key={s.id}>
              <Link href={`/payroll/${s.id}`} className="glass block animate-rise rounded-3xl p-5 transition-transform hover:-translate-y-0.5">
                <p className="text-xs text-muted-foreground">{periodLabel(s.period)}</p>
                <p className="mt-2 text-xl font-bold">{formatToman(s.net)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {PAY_TYPE_LABELS[s.payType]} · {formatMinutes(s.workedMinutes)} ساعت
                  {s.items > 0 && ` · ${toPersianDigits(s.items)} کار`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
