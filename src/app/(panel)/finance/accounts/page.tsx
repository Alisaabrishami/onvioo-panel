import { desc, isNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { balances, financeAccounts } from "@/lib/finance-data";
import { formatIsoDate, formatToman, toPersianDigits } from "@/lib/format";
import { createAccount } from "../actions";
import { AccountForm } from "../forms";

export const metadata: Metadata = { title: "حساب‌ها" };

export default async function AccountsPage() {
  await requireAdmin();
  const [accounts, bal, open, lastLines] = await Promise.all([
    financeAccounts(),
    balances(),
    db
      .select({ accountId: schema.bankLines.accountId, n: sql<number>`count(*)::int` })
      .from(schema.bankLines)
      .where(isNull(schema.bankLines.transactionId))
      .groupBy(schema.bankLines.accountId),
    db
      .selectDistinctOn([schema.bankLines.accountId], { accountId: schema.bankLines.accountId, day: schema.bankLines.day })
      .from(schema.bankLines)
      .orderBy(schema.bankLines.accountId, desc(schema.bankLines.day)),
  ]);

  return (
    <>
      <PageHeader title="حساب‌ها و تطبیق بانک" description="صورتحساب اکسل بانک را بارگذاری کنید تا با تراکنش‌های پنل تطبیق داده شود" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {accounts.length === 0 ? (
          <EmptyState>اولین حساب را بسازید؛ مثلاً حساب جاری سامان و صندوق نقدی.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {accounts.map((a) => {
              const unmatched = open.find((o) => o.accountId === a.id)?.n ?? 0;
              const last = lastLines.find((l) => l.accountId === a.id)?.day;
              return (
                <Link key={a.id} href={`/finance/accounts/${a.id}`} className="block">
                  <Card className="h-full transition-colors hover:border-primary">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.kind === "bank" ? "حساب بانکی" : "صندوق نقدی"}</p>
                      </div>
                      {unmatched > 0 && <Badge tone="warning">{toPersianDigits(unmatched)} سطر تطبیق‌نشده</Badge>}
                    </div>
                    <p className="mt-4 text-xl font-bold">{formatToman(bal.get(a.id) ?? 0)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {last ? `آخرین سطر صورتحساب: ${formatIsoDate(last)}` : a.kind === "bank" ? "هنوز صورتحسابی بارگذاری نشده" : "موجودی طبق پنل"}
                      {a.lockedThrough && ` · قفل تا ${formatIsoDate(a.lockedThrough)}`}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">حساب تازه</h2>
          <AccountForm action={createAccount} />
        </Card>
      </div>
    </>
  );
}
