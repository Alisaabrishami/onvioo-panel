import { and, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { Check, Link2, Unlink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { PeriodNav, readPeriod } from "@/components/period-nav";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { clientOptions, isUuid } from "@/lib/data";
import { CATEGORY_DIRECTION, CATEGORY_LABELS, guessBankMapping, suggestCategory, suggestMatches, type BankMapping } from "@/lib/finance";
import { balances, partnersList, periodDayRange, transactionsBetween } from "@/lib/finance-data";
import { formatIsoDate, formatJalaliDateTime, formatToman, isoDateToJalali, toPersianDigits } from "@/lib/format";
import { addDays, tehranDay } from "@/lib/growth";
import { periodOf } from "@/lib/payroll";
import {
  confirmStatement,
  discardBatch,
  lockAccount,
  matchLine,
  recordLine,
  runAutoMatch,
  setOpeningBalance,
  undoBatch,
  unmatchLine,
  uploadStatement,
} from "../../actions";
import { LockForm, OpeningBalanceForm, RecordLineForm, StatementMappingForm, UploadForm } from "../../forms";

export const metadata: Metadata = { title: "تطبیق بانک" };

const num = (v: string | string[] | undefined) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

export default async function AccountPage(props: PageProps<"/finance/accounts/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!isUuid(id)) notFound();
  const [account] = await db.select().from(schema.financeAccounts).where(eq(schema.financeAccounts.id, id));
  if (!account) notFound();

  // Step 2 of an upload: confirm which column is which
  const batchId = typeof sp.batch === "string" && isUuid(sp.batch) ? sp.batch : null;
  if (batchId) {
    const [batch] = await db
      .select()
      .from(schema.importBatches)
      .where(and(eq(schema.importBatches.id, batchId), eq(schema.importBatches.accountId, id), isNull(schema.importBatches.confirmedAt)));
    if (batch?.pending) {
      const header = batch.pending[0];
      const saved = account.importMapping as BankMapping | null;
      const guess = saved && Math.max(saved.date, saved.amount ?? 0, saved.debit ?? 0, saved.credit ?? 0) < header.length ? saved : { ...guessBankMapping(header), rial: true };
      return (
        <>
          <PageHeader title={`بارگذاری صورتحساب · ${account.name}`} description={batch.fileName} />
          <Card>
            <StatementMappingForm
              action={confirmStatement.bind(null, id, batchId)}
              header={header}
              sample={batch.pending.slice(1, 6)}
              guess={guess}
              total={batch.pending.length - 1}
              discard={discardBatch.bind(null, batchId, `/finance/accounts/${id}`)}
            />
          </Card>
        </>
      );
    }
  }

  const [latest] = await db.select({ day: schema.bankLines.day }).from(schema.bankLines).where(eq(schema.bankLines.accountId, id)).orderBy(desc(schema.bankLines.day)).limit(1);
  const current = periodOf();
  const fallback = latest ? periodOf(new Date(`${latest.day}T12:00:00+03:30`)) : current;
  const period = typeof sp.period === "string" ? readPeriod(sp.period, current) : fallback;
  const { from, to } = periodDayRange(period);

  const [lines, txs, linkedIds, batches, clients, partners] = await Promise.all([
    db
      .select()
      .from(schema.bankLines)
      .where(and(eq(schema.bankLines.accountId, id), gte(schema.bankLines.day, from), lt(schema.bankLines.day, to)))
      .orderBy(schema.bankLines.day, schema.bankLines.dedupeKey),
    // A wider window so a payment recorded a few days off still shows up as a candidate
    transactionsBetween(addDays(from, -14), addDays(to, 14), id),
    db.select({ id: schema.bankLines.transactionId }).from(schema.bankLines).where(and(eq(schema.bankLines.accountId, id), isNotNull(schema.bankLines.transactionId))),
    db.select().from(schema.importBatches).where(and(eq(schema.importBatches.accountId, id), isNotNull(schema.importBatches.confirmedAt))).orderBy(desc(schema.importBatches.createdAt)).limit(10),
    clientOptions(),
    partnersList(),
  ]);
  const linked = new Set(linkedIds.map((l) => l.id));
  const txById = new Map(txs.map((t) => [t.id, t]));
  const matched = lines.filter((l) => l.transactionId);
  const bankOnly = lines.filter((l) => !l.transactionId);
  const freeTxs = txs.filter((t) => !linked.has(t.id));
  const panelOnly = freeTxs.filter((t) => t.day >= from && t.day < to);
  const locked = (day: string) => !!account.lockedThrough && day <= account.lockedThrough;

  const lastLine = [...lines].reverse().find((l) => l.balance != null);
  const panelBalance = lastLine ? (await balances(lastLine.day)).get(id) ?? 0 : null;
  const diff = lastLine && panelBalance != null ? lastLine.balance! - panelBalance : null;
  const monthEnd = addDays(to, -1);
  const lockDefault = lastLine?.day ?? (monthEnd > tehranDay() ? tehranDay() : monthEnd);
  const options = { clients, partners: partners.map((p) => ({ id: p.id, name: p.name })) };
  const notice = num(sp.imported) != null && (
    <Card className="mb-6 border-success/40 bg-success/5 text-sm">
      {toPersianDigits(num(sp.imported)!)} سطر تازه ثبت شد
      {!!num(sp.skipped) && ` · ${toPersianDigits(num(sp.skipped)!)} سطر تکراری کنار گذاشته شد`}
      {` · ${toPersianDigits(num(sp.matched) ?? 0)} مورد خودکار تطبیق داده شد`}
      {!!num(sp.problems) && ` · ${toPersianDigits(num(sp.problems)!)} سطر خوانده نشد (تاریخ یا مبلغ نامعتبر)`}
    </Card>
  );

  return (
    <>
      <PageHeader
        title={account.name}
        description={account.kind === "bank" ? "تطبیق صورتحساب بانک با تراکنش‌های پنل" : "صندوق نقدی"}
        actions={<PeriodNav period={period} basePath={`/finance/accounts/${id}`} current={current} />}
      />
      {notice}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs text-muted-foreground">مانده طبق بانک {lastLine && `(${formatIsoDate(lastLine.day)})`}</p>
          <p className="mt-1 text-xl font-bold">{lastLine ? formatToman(lastLine.balance!) : "—"}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">مانده طبق پنل در همان روز</p>
          <p className="mt-1 text-xl font-bold">{panelBalance != null ? formatToman(panelBalance) : "—"}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">اختلاف</p>
          {diff == null ? (
            <p className="mt-1 text-sm text-muted-foreground">صورتحساب ستون مانده ندارد یا بارگذاری نشده</p>
          ) : diff === 0 ? (
            <p className="mt-1 flex items-center gap-1 text-xl font-bold text-success"><Check className="size-5" /> برابر</p>
          ) : (
            <p className="mt-1 text-xl font-bold text-danger">{formatToman(diff)}</p>
          )}
        </Card>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {toPersianDigits(lines.length)} سطر بانک در این ماه · {toPersianDigits(matched.length)} تطبیق‌شده · {toPersianDigits(bankOnly.length)} فقط در بانک · {toPersianDigits(panelOnly.length)} فقط در پنل
        </p>
        <ActionButton action={runAutoMatch.bind(null, id)} pendingLabel="در حال تطبیق…">تطبیق خودکار دوباره</ActionButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Column title="فقط در بانک" hint="در پنل ثبت نشده؛ با یک کلیک ثبت کنید" tone="warning" count={bankOnly.length}>
          {bankOnly.map((l) => {
            const incoming = l.amount > 0;
            let suggested = suggestCategory(l.description ?? "", l.amount);
            if (CATEGORY_DIRECTION[suggested] !== (incoming ? "in" : "out")) suggested = incoming ? "client_payment" : "other_expense";
            const candidates = suggestMatches(l, freeTxs);
            return (
              <li key={l.id} className="rounded-lg border border-border p-3">
                <LineHead day={l.day} amount={l.amount} text={l.description ?? ""} reference={l.reference} />
                {!locked(l.day) && (
                  <>
                    {candidates.map((c) => (
                      <form key={c.id} action={matchLine.bind(null, l.id, c.id)} className="mt-2">
                        <button type="submit" className="flex w-full items-center gap-2 rounded-md bg-primary/5 px-2 py-1.5 text-right text-xs text-primary hover:bg-primary/10">
                          <Link2 className="size-3.5 shrink-0" />
                          همین است: {formatIsoDate(c.day)} · {formatToman(c.amount)} · {txById.get(c.id)?.description ?? CATEGORY_LABELS[txById.get(c.id)!.category]}
                        </button>
                      </form>
                    ))}
                    <RecordLineForm action={recordLine.bind(null, l.id)} incoming={incoming} suggested={suggested} {...options} />
                  </>
                )}
              </li>
            );
          })}
        </Column>

        <Column title="تطبیق‌شده" hint="هم در بانک هست هم در پنل" tone="success" count={matched.length}>
          {matched.map((l) => {
            const t = txById.get(l.transactionId!);
            return (
              <li key={l.id} className="rounded-lg border border-border p-3">
                <LineHead day={l.day} amount={l.amount} text={l.description ?? ""} reference={l.reference} />
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    پنل: {t ? `${formatIsoDate(t.day)} · ${CATEGORY_LABELS[t.category]}${t.description ? ` · ${t.description}` : ""}` : "تراکنش خارج از این بازه"}
                  </span>
                  {!locked(l.day) && (
                    <form action={unmatchLine.bind(null, l.id)}>
                      <button type="submit" className="rounded p-1 hover:text-danger" aria-label="لغو تطبیق" title="لغو تطبیق">
                        <Unlink className="size-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </Column>

        <Column title="فقط در پنل" hint="در صورتحساب این ماه دیده نشد؛ شاید هنوز به بانک نرسیده یا اشتباه ثبت شده" tone="danger" count={panelOnly.length}>
          {panelOnly.map((t) => (
            <li key={t.id} className="rounded-lg border border-border p-3">
              <LineHead day={t.day} amount={t.direction === "in" ? t.amount : -t.amount} text={t.description ?? CATEGORY_LABELS[t.category]} reference={t.reference} />
              <p className="mt-1 text-xs text-muted-foreground">{CATEGORY_LABELS[t.category]}</p>
            </li>
          ))}
        </Column>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {account.kind === "bank" && (
          <Card>
            <h2 className="mb-1 font-semibold">بارگذاری صورتحساب</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              از اینترنت‌بانک سامان، گردش حساب را با خروجی اکسل بگیرید. سطرهایی که قبلاً آمده‌اند دوباره ثبت نمی‌شوند.
            </p>
            <UploadForm action={uploadStatement.bind(null, id)} label="فایل صورتحساب (xlsx یا CSV)" />
          </Card>
        )}
        <Card className="space-y-5">
          <div>
            <h2 className="mb-1 font-semibold">قفل دوره</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              وقتی یک ماه تطبیق شد، قفلش کنید تا تراکنش‌های آن دیگر تغییر نکند.
              {account.lockedThrough && <> الان تا <b>{formatIsoDate(account.lockedThrough)}</b> قفل است.</>}
            </p>
            <LockForm action={lockAccount.bind(null, id)} defaultDay={isoDateToJalali(lockDefault)} />
          </div>
          <OpeningBalanceForm action={setOpeningBalance.bind(null, id)} value={account.openingBalance} />
        </Card>
      </div>

      {batches.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold">فایل‌های بارگذاری‌شده</h2>
          <ul className="divide-y divide-border text-sm">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {b.fileName} <span className="text-xs text-muted-foreground">· {toPersianDigits(b.rows)} سطر · {formatJalaliDateTime(b.createdAt)}</span>
                </span>
                <form action={undoBatch.bind(null, b.id)}>
                  <button type="submit" className="text-xs text-muted-foreground hover:text-danger">برگرداندن این بارگذاری</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Column({ title, hint, tone, count, children }: { title: string; hint: string; tone: "success" | "warning" | "danger"; count: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Badge tone={tone}>{toPersianDigits(count)}</Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      {count === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">موردی نیست</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  );
}

function LineHead({ day, amount, text, reference }: { day: string; amount: number; text: string; reference: string | null }) {
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{formatIsoDate(day)}</span>
        <span className={`font-semibold ${amount > 0 ? "text-success" : "text-danger"}`}>{formatToman(amount)}</span>
      </div>
      <p className="mt-1 line-clamp-2">{text || "—"}</p>
      {reference && <p className="text-xs text-muted-foreground" dir="ltr">{reference}</p>}
    </div>
  );
}
