import { count, desc, eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_TONES } from "./labels";

export const metadata: Metadata = { title: "مشتریان" };

export default async function ClientsPage() {
  const user = await requireTeam();
  const rows = await db
    .select({
      id: schema.clients.id,
      name: schema.clients.name,
      brand: schema.clients.brand,
      instagram: schema.clients.instagram,
      status: schema.clients.status,
      createdAt: schema.clients.createdAt,
      files: count(schema.files.id),
    })
    .from(schema.clients)
    .leftJoin(schema.files, eq(schema.files.clientId, schema.clients.id))
    .groupBy(schema.clients.id)
    .orderBy(desc(schema.clients.createdAt));

  return (
    <>
      <PageHeader
        title="مشتریان"
        description="همه مشتری‌ها و پیج‌هایی که برایشان محتوا می‌سازید"
        actions={
          user.role === "admin" && (
            <Link
              href="/clients/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              مشتری جدید
            </Link>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState>هنوز مشتری‌ای ثبت نشده است.</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-right text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">نام</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">اینستاگرام</th>
                <th className="px-4 py-3 font-medium">وضعیت</th>
                <th className="px-4 py-3 font-medium">فایل‌ها</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">تاریخ ثبت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium hover:text-primary">
                      {c.name}
                    </Link>
                    {c.brand && <p className="text-xs text-muted-foreground">{c.brand}</p>}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {c.instagram && <span className="ltr text-muted-foreground">@{c.instagram}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={CLIENT_STATUS_TONES[c.status]}>{CLIENT_STATUS_LABELS[c.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">{toPersianDigits(c.files)}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{formatJalaliDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
