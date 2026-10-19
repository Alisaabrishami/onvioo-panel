import { and, desc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONES } from "@/lib/contracts";
import { formatJalaliDate } from "@/lib/format";

export const metadata: Metadata = { title: "قراردادها" };

export default async function PortalContractsPage() {
  const user = await requireClient();
  const rows = await db
    .select({ id: schema.contracts.id, title: schema.contracts.title, status: schema.contracts.status, sentAt: schema.contracts.sentAt, signedAt: schema.contracts.signedAt })
    .from(schema.contracts)
    .where(and(eq(schema.contracts.clientId, user.clientId), ne(schema.contracts.status, "draft")))
    .orderBy(desc(schema.contracts.createdAt));
  return (
    <>
      <PageHeader title="قراردادها" />
      {rows.length === 0 ? (
        <EmptyState>قراردادی برای شما ثبت نشده است.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/portal/contracts/${c.id}`} className="flex items-center justify-between gap-3 glass rounded-3xl p-4 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/50">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.signedAt ? `امضا در ${formatJalaliDate(c.signedAt)}` : c.sentAt ? `ارسال در ${formatJalaliDate(c.sentAt)}` : ""}
                  </p>
                </div>
                <Badge tone={CONTRACT_STATUS_TONES[c.status]}>{CONTRACT_STATUS_LABELS[c.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
