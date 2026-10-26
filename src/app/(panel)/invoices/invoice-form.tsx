"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { formatToman, toLatinDigits } from "@/lib/format";
import type { FormState } from "@/lib/forms";
import { invoiceTotals } from "@/lib/invoice";
import { useFormAction } from "@/lib/use-form-action";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Row = { title: string; qty: string; price: string };
export type InvoiceInitial = {
  clientId: string;
  contractId: string;
  title: string;
  rows: Row[];
  discount: string;
  taxPct: string;
  issuedOn: string;
  dueOn: string;
  note: string;
};

const toNum = (v: string) => {
  const n = Number(toLatinDigits(v).replace(/[,٬\s]/g, "").replace("٫", "."));
  return Number.isFinite(n) ? n : 0;
};

export function InvoiceForm({
  action,
  clients,
  contracts,
  initial,
  submitLabel,
}: {
  action: Action;
  clients: { id: string; name: string }[];
  contracts: { id: string; clientId: string; title: string; amount: number | null }[];
  initial: InvoiceInitial;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const [clientId, setClientId] = useState(initial.clientId);
  const [rows, setRows] = useState<Row[]>(initial.rows.length ? initial.rows : [{ title: "", qty: "1", price: "" }]);
  const [discount, setDiscount] = useState(initial.discount);
  const [taxPct, setTaxPct] = useState(initial.taxPct);
  const v = state.values ?? {};
  const totals = invoiceTotals(
    rows.map((r) => ({ title: r.title, qty: toNum(r.qty), unitPrice: toNum(r.price) })),
    toNum(discount),
    Math.round(toNum(taxPct) * 100),
  );
  const myContracts = contracts.filter((c) => c.clientId === clientId);
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form key={state.at} action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="مشتری" htmlFor="inv-client" error={state.errors?.clientId}>
          <Select id="inv-client" name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">انتخاب کنید</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="قرارداد (اختیاری)" htmlFor="inv-contract">
          <Select id="inv-contract" name="contractId" defaultValue={v.contractId ?? initial.contractId} key={clientId}>
            <option value="">بدون قرارداد</option>
            {myContracts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </Field>
        <Field label="عنوان" htmlFor="inv-title" error={state.errors?.title}>
          <Input id="inv-title" name="title" placeholder="مثلاً پکیج محتوای مهر ۱۴۰۵" defaultValue={v.title ?? initial.title} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاریخ صدور" htmlFor="inv-issued" error={state.errors?.issuedOn}>
            <JalaliDateField id="inv-issued" name="issuedOn" defaultDate={v.issuedOn ?? initial.issuedOn} />
          </Field>
          <Field label="مهلت پرداخت" htmlFor="inv-due" error={state.errors?.dueOn}>
            <JalaliDateField id="inv-due" name="dueOn" defaultDate={v.dueOn ?? initial.dueOn} />
          </Field>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">ردیف‌ها</legend>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_8rem_2rem] items-center gap-2 max-sm:grid-cols-[1fr_4rem_2rem] max-sm:[&>*:nth-child(3)]:col-span-2">
            <Input name="itemTitle" aria-label="شرح" placeholder="شرح خدمت" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} />
            <Input name="itemQty" aria-label="تعداد" inputMode="decimal" dir="ltr" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
            <Input name="itemPrice" aria-label="مبلغ واحد" inputMode="numeric" dir="ltr" placeholder="مبلغ واحد" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} />
            <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))} className="rounded-full p-1.5 text-muted-foreground hover:text-danger" aria-label="حذف ردیف">
              <X className="size-4" />
            </button>
          </div>
        ))}
        {state.errors?.items && <p className="text-xs text-danger">{state.errors.items[0]}</p>}
        <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setRows((rs) => [...rs, { title: "", qty: "1", price: "" }])}>
          <Plus className="size-3.5" />ردیف تازه
        </Button>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
        <Field label="تخفیف (تومان)" htmlFor="inv-discount" error={state.errors?.discount}>
          <Input id="inv-discount" name="discount" inputMode="numeric" dir="ltr" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <Field label="مالیات بر ارزش افزوده (٪)" htmlFor="inv-tax" error={state.errors?.taxPct}>
          <Input id="inv-tax" name="taxPct" inputMode="decimal" dir="ltr" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
        </Field>
        <div className="rounded-2xl bg-muted px-4 py-3 text-sm">
          <div className="flex justify-between text-muted-foreground"><span>جمع</span><span>{formatToman(totals.subtotal)}</span></div>
          {totals.tax > 0 && <div className="flex justify-between text-muted-foreground"><span>مالیات</span><span>{formatToman(totals.tax)}</span></div>}
          <div className="mt-1 flex justify-between font-bold"><span>قابل پرداخت</span><span data-testid="invoice-total">{formatToman(totals.total)}</span></div>
        </div>
      </div>

      <Field label="یادداشت روی فاکتور (اختیاری)" htmlFor="inv-note">
        <Textarea id="inv-note" name="note" defaultValue={v.note ?? initial.note} className="min-h-16" />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="send" disabled={pending}>ذخیره و ارسال برای مشتری</Button>
        <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>{submitLabel}</Button>
        {state.message && <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>}
      </div>
    </form>
  );
}
