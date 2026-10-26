import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { guessBankMapping } from "@/lib/finance";
import { financeAccounts } from "@/lib/finance-data";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import { confirmLedger, discardBatch, undoBatch, uploadLedger } from "../actions";
import { LedgerMappingForm, UploadForm } from "../forms";

export const metadata: Metadata = { title: "ورود دیتای گذشته" };

// In an accounting ledger of a bank account (Parmis "دفتر معین") debit is money in
function guessLedger(header: string[]) {
  const g = guessBankMapping(header);
  const accounting = header.some((h) => h.includes("بدهکار") || h.includes("بستانکار"));
  return accounting ? { ...g, debit: g.credit, credit: g.debit, rial: true } : { ...g, rial: true };
}

export default async function ImportPage(props: PageProps<"/finance/import">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const accounts = (await financeAccounts()).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }));
  const batchId = typeof sp.batch === "string" && isUuid(sp.batch) ? sp.batch : null;

  if (batchId) {
    const [batch] = await db
      .select()
      .from(schema.importBatches)
      .where(and(eq(schema.importBatches.id, batchId), eq(schema.importBatches.kind, "transactions"), isNull(schema.importBatches.confirmedAt)));
    if (batch?.pending) {
      const header = batch.pending[0];
      return (
        <>
          <PageHeader title="ورود دیتای گذشته" description={batch.fileName} />
          <Card>
            <LedgerMappingForm
              action={confirmLedger.bind(null, batchId)}
              header={header}
              sample={batch.pending.slice(1, 6)}
              guess={guessLedger(header)}
              total={batch.pending.length - 1}
              accounts={accounts}
              discard={discardBatch.bind(null, batchId, "/finance/import")}
            />
          </Card>
        </>
      );
    }
  }

  const batches = await db
    .select({ batch: schema.importBatches, account: schema.financeAccounts.name })
    .from(schema.importBatches)
    .leftJoin(schema.financeAccounts, eq(schema.financeAccounts.id, schema.importBatches.accountId))
    .where(and(eq(schema.importBatches.kind, "transactions"), isNotNull(schema.importBatches.confirmedAt)))
    .orderBy(desc(schema.importBatches.createdAt));
  const done = typeof sp.done === "string" ? Number(sp.done) : null;

  return (
    <>
      <PageHeader title="ورود دیتای گذشته" description="تراکنش‌های قبلی را از پارمیس یا هر فایل اکسلی یک‌جا وارد کنید" />
      {done != null && (
        <Card className="mb-6 border-success/40 bg-success/5 text-sm">{toPersianDigits(done)} تراکنش وارد شد. دسته‌ها را در فهرست تراکنش‌ها مرور کنید.</Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">اول در «حساب‌ها» حسابی که این تراکنش‌ها مال آن است را بسازید.</p>
          ) : (
            <UploadForm
              action={uploadLedger}
              label="فایل خروجی (xlsx یا CSV)"
              hint="در پارمیس از دفتر معین هر حساب (بانک یا صندوق) خروجی اکسل بگیرید و هر حساب را جدا وارد کنید. قبل از ثبت، پیش‌نمایش می‌بینید."
            />
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">ورودهای قبلی</h2>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز فایلی وارد نشده است.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {batches.map(({ batch: b, account }) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {b.fileName}
                    <span className="block text-xs text-muted-foreground">{account} · {toPersianDigits(b.rows)} تراکنش · {formatJalaliDateTime(b.createdAt)}</span>
                  </span>
                  <form action={undoBatch.bind(null, b.id)}>
                    <button type="submit" className="text-xs text-muted-foreground hover:text-danger">حذف همه تراکنش‌های این فایل</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
