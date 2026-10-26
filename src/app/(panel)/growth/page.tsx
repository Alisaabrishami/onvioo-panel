import { and, asc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { compact } from "@/components/charts";
import { Delta } from "@/components/delta";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { aiConfigured } from "@/lib/ai";
import { requireTeam } from "@/lib/auth/dal";
import { addDays, followerChange, followerSeries, tehranDay } from "@/lib/growth";
import { dailyStats } from "@/lib/growth-data";

export const metadata: Metadata = { title: "رشد پیج‌ها" };

export default async function GrowthPage() {
  await requireTeam();
  const [clients, accounts] = await Promise.all([
    db
      .select({ id: schema.clients.id, name: schema.clients.name, instagram: schema.clients.instagram })
      .from(schema.clients)
      .where(ne(schema.clients.status, "ended"))
      .orderBy(asc(schema.clients.name)),
    db.select().from(schema.igAccounts).where(and(eq(schema.igAccounts.kind, "own"))).orderBy(asc(schema.igAccounts.createdAt)),
  ]);
  const stats = await dailyStats(accounts.map((a) => a.id), addDays(tehranDay(), -40));

  const rows = clients.map((c) => {
    const account = accounts.find((a) => a.clientId === c.id);
    const s = account ? stats.filter((x) => x.accountId === account.id) : [];
    return {
      client: c,
      account,
      followers: followerSeries(s).at(-1)?.followers ?? null,
      change7: followerChange(s, 7),
      change30: followerChange(s, 30),
    };
  });
  rows.sort((a, b) => (b.change7 ?? -Infinity) - (a.change7 ?? -Infinity));

  return (
    <>
      <PageHeader title="رشد پیج‌ها" description="فالوور، بازدید، پیش‌بینی و تحلیل هوش مصنوعی هر مشتری" />
      {!aiConfigured() && (
        <p className="mb-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          تحلیل‌های هوش مصنوعی بعد از قرار دادن کلید Claude روی سرور فعال می‌شوند؛ نمودارها و پیش‌بینی همین حالا کار می‌کنند.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState>هنوز مشتری فعالی ثبت نشده است.</EmptyState>
      ) : (
        <div className="overflow-hidden glass rounded-3xl">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-right font-medium">مشتری</th>
                <th className="px-4 py-3 text-right font-medium">فالوور</th>
                <th className="px-4 py-3 text-right font-medium">۷ روز</th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">۳۰ روز</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.client.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/growth/${r.client.id}`} className="font-medium hover:text-primary">{r.client.name}</Link>
                    <p className="ltr text-right text-xs text-muted-foreground">
                      {r.account ? `@${r.account.username}` : r.client.instagram ? `@${r.client.instagram.replace(/^@/, "")}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {r.followers != null ? compact(r.followers) : <Badge>بدون آمار</Badge>}
                  </td>
                  <td className="px-4 py-3"><Delta value={r.change7} /></td>
                  <td className="hidden px-4 py-3 sm:table-cell"><Delta value={r.change30} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
