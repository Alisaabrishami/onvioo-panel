import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { CATEGORY_LABELS } from "@/lib/finance";
import { financeAccounts } from "@/lib/finance-data";
import { formatToman, toPersianDigits } from "@/lib/format";
import { createRecurring, setRecurringActive } from "../actions";
import { RecurringForm } from "../forms";

export const metadata: Metadata = { title: "هزینه‌های ثابت" };

export default async function RecurringPage() {
  await requireAdmin();
  const [items, accounts] = await Promise.all([
    db.select().from(schema.recurringExpenses).orderBy(schema.recurringExpenses.dueDay),
    financeAccounts(),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const monthly = items.filter((i) => i.active).reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <PageHeader title="هزینه‌های ثابت" description={`هزینه‌های ماهانه‌ای که تکرار می‌شوند؛ جمع ماهانه ${formatToman(monthly)}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {items.length === 0 ? (
          <EmptyState>اجاره، هاست، اینترنت و اشتراک‌ها را اینجا تعریف کنید تا هر ماه در خلاصه مالی یادآوری شود.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.id}>
                <Card className={`flex flex-wrap items-center justify-between gap-3 ${i.active ? "" : "opacity-60"}`}>
                  <div>
                    <p className="font-medium">{i.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[i.category]} · روز {toPersianDigits(i.dueDay)} هر ماه · {i.accountId ? accountName.get(i.accountId) : "حساب انتخاب نشده"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatToman(i.amount)}</span>
                    {!i.active && <Badge>متوقف</Badge>}
                    <form action={setRecurringActive.bind(null, i.id, !i.active)}>
                      <button type="submit" className="text-xs text-muted-foreground hover:text-primary">{i.active ? "توقف" : "فعال‌کردن"}</button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">هزینه ثابت تازه</h2>
          <RecurringForm action={createRecurring} accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))} />
        </Card>
      </div>
    </>
  );
}
