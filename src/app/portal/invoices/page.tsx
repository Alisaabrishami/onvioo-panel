import { desc, and, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { formatIsoDate, formatToman, toPersianDigits } from "@/lib/format";
import { tehranDay } from "@/lib/growth";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, isOverdue } from "@/lib/invoice";

export const metadata: Metadata = { title: "فاکتورها" };

export default async function PortalInvoices() {
  const user = await requireClient();
  const rows = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.clientId, user.clientId), ne(schema.invoices.status, "draft")))
    .orderBy(desc(schema.invoices.issuedOn));
  const today = tehranDay();
  const due = rows.filter((r) => r.status === "sent");

  return (
    <>
      <PageHeader title="فاکتورها" description={due.length ? `${toPersianDigits(due.length)} فاکتور منتظر پرداخت · ${formatToman(due.reduce((s, r) => s + r.total, 0))}` : "همه فاکتورها پرداخت شده‌اند"} />
      {rows.length === 0 ? (
        <EmptyState>هنوز فاکتوری برای شما صادر نشده است.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((i) => (
            <li key={i.id}>
              <Link href={`/portal/invoices/${i.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-primary/60">
                  <div>
                    <p className="font-medium">{i.title}</p>
                    <p className="text-xs text-muted-foreground">شماره {toPersianDigits(i.number ?? 0)} · {formatIsoDate(i.issuedOn)}{i.dueOn && ` · مهلت ${formatIsoDate(i.dueOn)}`}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{formatToman(i.total)}</span>
                    {isOverdue(i, today) ? <Badge tone="danger">سررسید گذشته</Badge> : <Badge tone={INVOICE_STATUS_TONES[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
