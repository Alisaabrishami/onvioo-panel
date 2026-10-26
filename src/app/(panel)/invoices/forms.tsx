"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>;
}

export function MarkPaidForm({ action, accounts, today }: { action: Action; accounts: Option[]; today: string }) {
  const [state, formAction, pending] = useFormAction(action);
  if (accounts.length === 0) return <p className="text-sm text-muted-foreground">برای ثبت پرداخت، اول در بخش مالی یک حساب بسازید.</p>;
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="به حساب" htmlFor="paid-account" error={state.errors?.accountId}>
          <Select id="paid-account" name="accountId" defaultValue={accounts[0].id}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="تاریخ" htmlFor="paid-day" error={state.errors?.day}>
          <JalaliDateField id="paid-day" name="day" defaultDate={today} />
        </Field>
        <Field label="شماره پیگیری (اختیاری)" htmlFor="paid-ref">
          <Input id="paid-ref" name="reference" dir="ltr" />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>ثبت پرداخت دستی</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function PaymentSettingsForm({ action, accounts, initial }: { action: Action; accounts: Option[]; initial: { accountId: string; taxPct: string; dueDays: string } }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <Field label="پرداخت‌های آنلاین به کدام حساب برود؟" htmlFor="ps-account">
        <Select id="ps-account" name="accountId" defaultValue={initial.accountId}>
          <option value="">اولین حساب بانکی</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="مالیات پیش‌فرض (٪)" htmlFor="ps-tax" error={state.errors?.taxPct}>
          <Input id="ps-tax" name="taxPct" inputMode="decimal" dir="ltr" defaultValue={initial.taxPct} />
        </Field>
        <Field label="مهلت پرداخت (روز)" htmlFor="ps-due" error={state.errors?.dueDays}>
          <Input id="ps-due" name="dueDays" inputMode="numeric" dir="ltr" defaultValue={initial.dueDays} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>ذخیره</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} dir="ltr" className="text-xs" onFocus={(e) => e.target.select()} aria-label="لینک پرداخت" />
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "کپی شد" : "کپی"}
      </Button>
    </div>
  );
}
