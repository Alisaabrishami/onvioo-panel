import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONES } from "@/lib/contracts";
import { formatJalaliDate, formatToman } from "@/lib/format";

export const metadata: Metadata = { title: "قراردادها" };

export default async function ContractsPage() {
  await requireAdmin();
  const rows = await db
    .select({
      id: schema.contracts.id,
      title: schema.contracts.title,
      status: schema.contracts.status,
      amount: schema.contracts.amount,
      createdAt: schema.contracts.createdAt,
      signedAt: schema.contracts.signedAt,
      clientName: schema.clients.name,
    })
    .from(schema.contracts)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clientId))
    .orderBy(desc(schema.contracts.createdAt));

  return (
    <>
      <PageHeader
        title="قراردادها"
        description="قرارداد دیجیتال با امضای پیامکی مشتری در پرتال"
        actions={
          <Link href="/contracts/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" />
            قرارداد جدید
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState>هنوز قراردادی ثبت نشده است.</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-right text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">قرارداد</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">مبلغ</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">تاریخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link href={`/contracts/${c.id}`} className="font-medium hover:text-primary">{c.title}</Link>
                    <p className="text-xs text-muted-foreground">{c.clientName}</p>
                  </td>
                  <td className="px-4 py-3"><Badge tone={CONTRACT_STATUS_TONES[c.status]}>{CONTRACT_STATUS_LABELS[c.status]}</Badge></td>
                  <td className="hidden px-4 py-3 sm:table-cell">{c.amount !== null && formatToman(c.amount)}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{formatJalaliDate(c.signedAt ?? c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
