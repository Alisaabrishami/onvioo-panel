import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { partnerBalances } from "@/lib/finance";
import { partnerTransactions, partnersList, profitBefore } from "@/lib/finance-data";
import { formatToman, toPersianDigits } from "@/lib/format";
import { createPartner } from "../actions";
import { PartnerForm } from "../forms";

export const metadata: Metadata = { title: "شرکا" };

export default async function PartnersPage() {
  await requireAdmin();
  const [partners, txs, profit] = await Promise.all([partnersList(), partnerTransactions(), profitBefore("9999-12-31")]);
  const rows = partnerBalances(partners, txs, profit);
  const totalShare = partners.reduce((s, p) => s + p.shareBp, 0);

  return (
    <>
      <PageHeader title="شرکا" description="سهم هر شریک از سود، آورده‌ها و برداشت‌ها" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {partners.length > 0 && totalShare !== 10000 && (
            <Card className="border-warning/40 bg-warning/5 text-sm">جمع سهم‌ها {toPersianDigits(totalShare / 100)}٪ است، نه ۱۰۰٪.</Card>
          )}
          {partners.length === 0 ? (
            <EmptyState>شریکی ثبت نشده است.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">شریک</th>
                    <th className="px-4 py-3 text-right font-medium">مانده اول</th>
                    <th className="px-4 py-3 text-right font-medium">آورده</th>
                    <th className="px-4 py-3 text-right font-medium">سهم سود</th>
                    <th className="px-4 py-3 text-right font-medium">برداشت</th>
                    <th className="px-4 py-3 text-right font-medium">مانده</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => {
                    const r = rows.find((x) => x.id === p.id)!;
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">
                          {p.name} <span className="text-xs text-muted-foreground">({toPersianDigits(p.shareBp / 100)}٪)</span>
                        </td>
                        <td className="px-4 py-3">{formatToman(p.openingBalance)}</td>
                        <td className="px-4 py-3">{formatToman(r.contributed)}</td>
                        <td className="px-4 py-3">{formatToman(r.share)}</td>
                        <td className="px-4 py-3">{formatToman(r.drawn)}</td>
                        <td className={`px-4 py-3 font-semibold ${r.balance < 0 ? "text-danger" : ""}`}>{formatToman(r.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            سود کل از اولین تراکنش ثبت‌شده: {formatToman(profit)}. مانده مثبت یعنی طلب شریک از شرکت، منفی یعنی بیشتر از سهمش برداشته است.
            برداشت و آورده را در تراکنش‌ها با دسته «برداشت شریک» یا «آورده شریک» ثبت کنید.
          </p>
        </div>
        <Card className="h-fit">
          <h2 className="mb-4 font-semibold">شریک تازه</h2>
          <PartnerForm action={createPartner} />
        </Card>
      </div>
    </>
  );
}
