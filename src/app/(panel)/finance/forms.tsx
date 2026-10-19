"use client";

import { useActionState, useState } from "react";
import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select } from "@/components/ui";
import type { FinanceCategory } from "@/db/schema";
import { CATEGORY_DIRECTION, CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, PARTNER_CATEGORIES, type BankMapping } from "@/lib/finance";
import { formatIsoDate, formatToman, toPersianDigits } from "@/lib/format";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";
import type { LedgerPreview } from "./actions";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>;
}

function CategoryOptions({ only }: { only?: "in" | "out" }) {
  const groups = [
    { label: "درآمد", items: INCOME_CATEGORIES },
    { label: "هزینه", items: EXPENSE_CATEGORIES },
    { label: "شرکا", items: PARTNER_CATEGORIES },
  ];
  return groups.map((g) => {
    const items = g.items.filter((c) => !only || CATEGORY_DIRECTION[c] === only);
    if (items.length === 0) return null;
    return (
      <optgroup key={g.label} label={g.label}>
        {items.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
      </optgroup>
    );
  });
}

export function TransactionForm({
  action,
  accounts,
  clients,
  partners,
  today,
}: {
  action: Action;
  accounts: Option[];
  clients: Option[];
  partners: Option[];
  today: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.values ?? {};
  const [category, setCategory] = useState<string>(v.category ?? "client_payment");
  if (accounts.length === 0) return <p className="text-sm text-muted-foreground">اول یک حساب بانکی یا صندوق بسازید.</p>;
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="دسته" htmlFor="tx-category" error={state.errors?.category}>
          <Select id="tx-category" name="category" defaultValue={category} onChange={(e) => setCategory(e.target.value)}>
            <CategoryOptions />
          </Select>
        </Field>
        <Field label="مبلغ (تومان)" htmlFor="tx-amount" error={state.errors?.amount}>
          <Input id="tx-amount" name="amount" inputMode="numeric" dir="ltr" defaultValue={state.ok ? "" : v.amount} />
        </Field>
        <Field label="حساب" htmlFor="tx-account" error={state.errors?.accountId}>
          <Select id="tx-account" name="accountId" defaultValue={v.accountId ?? accounts[0].id}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="تاریخ" htmlFor="tx-day" error={state.errors?.day}>
          <JalaliDateField id="tx-day" name="day" defaultDate={state.ok ? today : (v.day ?? today)} />
        </Field>
        {category === "client_payment" && (
          <Field label="مشتری" htmlFor="tx-client" error={state.errors?.clientId}>
            <Select id="tx-client" name="clientId" defaultValue={state.ok ? "" : (v.clientId ?? "")}>
              <option value="">بدون مشتری</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        {category.startsWith("partner_") && (
          <Field label="شریک" htmlFor="tx-partner" error={state.errors?.partnerId}>
            <Select id="tx-partner" name="partnerId" defaultValue={v.partnerId ?? ""}>
              <option value="">انتخاب کنید</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="شرح" htmlFor="tx-description">
          <Input id="tx-description" name="description" defaultValue={state.ok ? "" : v.description} />
        </Field>
        <Field label="شماره پیگیری (اختیاری)" htmlFor="tx-reference">
          <Input id="tx-reference" name="reference" dir="ltr" defaultValue={state.ok ? "" : v.reference} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>ثبت</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function AccountForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <Field label="نام حساب" htmlFor="acc-name" error={state.errors?.name}>
        <Input id="acc-name" name="name" placeholder="مثلاً سامان جاری" defaultValue={v.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="نوع" htmlFor="acc-kind">
          <Select id="acc-kind" name="kind" defaultValue={v.kind ?? "bank"}>
            <option value="bank">حساب بانکی</option>
            <option value="cash">صندوق نقدی</option>
          </Select>
        </Field>
        <Field label="موجودی اول (تومان)" htmlFor="acc-opening" error={state.errors?.openingBalance}>
          <Input id="acc-opening" name="openingBalance" inputMode="numeric" dir="ltr" defaultValue={v.openingBalance} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>ساخت حساب</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function OpeningBalanceForm({ action, value }: { action: Action; value: number }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="flex flex-wrap items-end gap-2">
      <Field label="موجودی اول حساب (تومان)" htmlFor="ob" error={state.errors?.openingBalance}>
        <Input id="ob" name="openingBalance" inputMode="numeric" dir="ltr" defaultValue={String(value)} className="w-40" />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>ذخیره</Button>
      <Message state={state} />
    </form>
  );
}

export function PartnerForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <Field label="نام" htmlFor="pt-name" error={state.errors?.name}>
        <Input id="pt-name" name="name" defaultValue={v.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="سهم از سود (درصد)" htmlFor="pt-share" error={state.errors?.share}>
          <Input id="pt-share" name="share" inputMode="decimal" dir="ltr" defaultValue={v.share} />
        </Field>
        <Field label="مانده اول (تومان)" htmlFor="pt-opening" error={state.errors?.openingBalance}>
          <Input id="pt-opening" name="openingBalance" inputMode="numeric" dir="ltr" defaultValue={v.openingBalance} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>افزودن شریک</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function RecurringForm({ action, accounts }: { action: Action; accounts: Option[] }) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="عنوان" htmlFor="rc-title" error={state.errors?.title}>
          <Input id="rc-title" name="title" placeholder="مثلاً اجاره دفتر" defaultValue={v.title} />
        </Field>
        <Field label="دسته" htmlFor="rc-category">
          <Select id="rc-category" name="category" defaultValue={v.category ?? "rent"}>
            <CategoryOptions only="out" />
          </Select>
        </Field>
        <Field label="مبلغ ماهانه (تومان)" htmlFor="rc-amount" error={state.errors?.amount}>
          <Input id="rc-amount" name="amount" inputMode="numeric" dir="ltr" defaultValue={v.amount} />
        </Field>
        <Field label="روز سررسید در ماه" htmlFor="rc-due" error={state.errors?.dueDay}>
          <Input id="rc-due" name="dueDay" inputMode="numeric" dir="ltr" defaultValue={v.dueDay ?? "1"} />
        </Field>
        <Field label="از حساب" htmlFor="rc-account">
          <Select id="rc-account" name="accountId" defaultValue={v.accountId ?? accounts[0]?.id ?? ""}>
            <option value="">بعداً انتخاب می‌کنم</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>افزودن</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function UploadForm({ action, label, hint }: { action: Action; label: string; hint?: string }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <Field label={label} htmlFor="upload-file" error={state.errors?.file}>
        <Input id="upload-file" name="file" type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="pt-2" />
      </Field>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "در حال خواندن…" : "خواندن فایل"}</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

// Column pickers shared by bank statements and past-data files
function MappingFields({ header, guess, ledger, values }: { header: string[]; guess: Partial<BankMapping>; ledger?: boolean; values?: Record<string, string> }) {
  const [mode, setMode] = useState<"single" | "split">(
    values?.amountMode === "single" || values?.amountMode === "split" ? values.amountMode : guess.amount !== undefined && guess.debit === undefined ? "single" : "split",
  );
  // After a preview the person's own choices win over the guess
  const col = (name: string, label: string, value: number | undefined, optional = true) => (
    <Field label={label} htmlFor={`map-${name}`}>
      <Select id={`map-${name}`} name={name} defaultValue={values ? (values[name] ?? "") : value === undefined ? "" : String(value)}>
        {optional ? <option value="">ندارد</option> : <option value="">انتخاب کنید</option>}
        {header.map((h, i) => <option key={i} value={i}>{h || `ستون ${toPersianDigits(i + 1)}`}</option>)}
      </Select>
    </Field>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {col("date", "تاریخ", guess.date, false)}
        {col("description", "شرح", guess.description)}
        {col("reference", "شماره پیگیری / سند", guess.reference)}
        {ledger ? col("categoryCol", "دسته یا سرفصل (اختیاری)", undefined) : col("balance", "مانده", guess.balance)}
      </div>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1.5 text-sm font-medium">مبلغ‌ها در فایل</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="amountMode" value="split" checked={mode === "split"} onChange={() => setMode("split")} />
          دو ستون جدا ({ledger ? "ورود و خروج" : "برداشت / واریز"})
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="amountMode" value="single" checked={mode === "single"} onChange={() => setMode("single")} />
          یک ستون مبلغ (منفی یعنی خروج پول)
        </label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {mode === "split" ? (
          <>
            {col("debit", ledger ? "ستون خروج پول" : "برداشت", guess.debit)}
            {col("credit", ledger ? "ستون ورود پول" : "واریز", guess.credit)}
          </>
        ) : (
          col("amount", "مبلغ", guess.amount, false)
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="rial" defaultChecked={values ? values.rial === "on" : (guess.rial ?? true)} />
        مبلغ‌های فایل به ریال است (پنل به تومان نگه می‌دارد)
      </label>
    </div>
  );
}

function SampleTable({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>{header.map((h, i) => <th key={i} className="px-2 py-2 text-right font-medium">{h || `ستون ${toPersianDigits(i + 1)}`}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {header.map((_, j) => <td key={j} className="px-2 py-1.5 whitespace-nowrap">{r[j]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatementMappingForm({
  action,
  header,
  sample,
  guess,
  total,
  discard,
}: {
  action: Action;
  header: string[];
  sample: string[][];
  guess: Partial<BankMapping>;
  total: number;
  discard: () => Promise<void>;
}) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{toPersianDigits(total)} سطر در فایل است. ستون‌ها را بررسی کنید؛ پنل حدس زده و برای دفعه بعد همین را یادش می‌ماند.</p>
      <SampleTable header={header} rows={sample} />
      <form key={state.at} action={formAction} className="space-y-4">
        <MappingFields header={header} guess={guess} values={state.values} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "در حال ثبت و تطبیق…" : "ثبت سطرها و تطبیق خودکار"}</Button>
          <Button type="submit" variant="ghost" formAction={discard}>انصراف</Button>
          <Message state={state} />
        </div>
      </form>
    </div>
  );
}

export function LedgerMappingForm({
  action,
  header,
  sample,
  guess,
  total,
  accounts,
  discard,
}: {
  action: (state: LedgerPreview, formData: FormData) => Promise<LedgerPreview>;
  header: string[];
  sample: string[][];
  guess: Partial<BankMapping>;
  total: number;
  accounts: Option[];
  discard: () => Promise<void>;
}) {
  // Stamped like useFormAction so the form remounts with what was chosen instead of resetting
  const [state, formAction, pending] = useActionState<LedgerPreview & { at?: number }, FormData>(
    async (prev, formData) => ({ ...(await action(prev, formData)), at: Date.now() }),
    {},
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{toPersianDigits(total)} سطر در فایل است. ستون‌ها را مشخص کنید و پیش‌نمایش بگیرید.</p>
      <SampleTable header={header} rows={sample} />
      <form key={state.at} action={formAction} className="space-y-4">
        <Field label="این تراکنش‌ها مال کدام حساب است؟" htmlFor="ledger-account">
          <Select id="ledger-account" name="accountId" defaultValue={state.values?.accountId ?? accounts[0]?.id ?? ""} className="max-w-xs">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <MappingFields header={header} guess={guess} ledger values={state.values} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" name="intent" value="preview" variant="outline" disabled={pending}>پیش‌نمایش</Button>
          {state.preview && (
            <Button type="submit" name="intent" value="commit" disabled={pending || !state.total}>
              ثبت {toPersianDigits(state.total ?? 0)} تراکنش
            </Button>
          )}
          <Button type="submit" variant="ghost" formAction={discard}>انصراف</Button>
          <Message state={state} />
        </div>
      </form>
      {state.preview && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {toPersianDigits(state.total ?? 0)} سطر خوانده شد{state.problems?.length ? ` · ${toPersianDigits(state.problems.length)} سطر رد شد` : ""}. دسته‌ها حدسی است و بعداً در فهرست تراکنش‌ها قابل اصلاح است.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-sm">
              <tbody>
                {state.preview.map((r, i) => (
                  <tr key={i} className="border-t border-border first:border-t-0">
                    <td className="px-3 py-2 whitespace-nowrap">{formatIsoDate(r.day)}</td>
                    <td className={`px-3 py-2 whitespace-nowrap font-medium ${r.amount > 0 ? "text-success" : "text-danger"}`}>{formatToman(r.amount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{CATEGORY_LABELS[r.category as FinanceCategory]}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!state.problems?.length && <p className="text-xs text-muted-foreground">{state.problems.join("، ")}</p>}
        </div>
      )}
    </div>
  );
}

// Quick add for a bank line that is not in the panel yet
export function RecordLineForm({
  action,
  incoming,
  suggested,
  clients,
  partners,
}: {
  action: Action;
  incoming: boolean;
  suggested: FinanceCategory;
  clients: Option[];
  partners: Option[];
}) {
  const [state, formAction, pending] = useFormAction(action);
  const [category, setCategory] = useState<string>(suggested);
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <Select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-auto text-xs" aria-label="دسته">
        <CategoryOptions only={incoming ? "in" : "out"} />
      </Select>
      {category === "client_payment" && (
        <Select name="clientId" defaultValue="" className="h-8 w-auto text-xs" aria-label="مشتری">
          <option value="">مشتری؟</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      )}
      {category.startsWith("partner_") && (
        <Select name="partnerId" defaultValue="" className="h-8 w-auto text-xs" aria-label="شریک">
          <option value="">شریک؟</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      )}
      <Button type="submit" variant="outline" className="h-8 px-3 text-xs" disabled={pending}>ثبت در پنل</Button>
      {state.message && <span className="text-xs text-danger">{state.message}</span>}
    </form>
  );
}

export function LockForm({ action, defaultDay }: { action: Action; defaultDay: string }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="flex flex-wrap items-end gap-2">
      <Field label="تأیید و قفل تا تاریخ" htmlFor="lock-day" error={state.errors?.day}>
        <JalaliDateField id="lock-day" name="day" defaultDate={defaultDay} />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>قفل دوره</Button>
      <Message state={state} />
    </form>
  );
}
