import { desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import { TICKET_STATUS_LABELS, TICKET_STATUS_TONES } from "@/lib/services";

export const metadata: Metadata = { title: "پشتیبانی" };

export default async function PortalTicketsPage() {
  const user = await requireClient();
  const rows = await db
    .select()
    .from(schema.tickets)
    .where(eq(schema.tickets.clientId, user.clientId))
    .orderBy(desc(schema.tickets.updatedAt));
  return (
    <>
      <PageHeader
        title="پشتیبانی"
        actions={
          <Link href="/portal/tickets/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" />
            تیکت جدید
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState>تیکتی ثبت نکرده‌اید. اگر مشکلی در سایت یا درخواستی دارید، تیکت جدید بزنید.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.id}>
              <Link href={`/portal/tickets/${t.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/50">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    <span className="text-muted-foreground">#{toPersianDigits(t.number ?? 0)}</span> {t.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatJalaliDateTime(t.updatedAt)}</p>
                </div>
                <Badge tone={TICKET_STATUS_TONES[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
