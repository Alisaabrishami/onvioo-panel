"use client";

import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>;
}

const FIELDS = [
  { name: "base", label: "پایه" },
  { name: "overtime", label: "اضافه‌کار" },
  { name: "bonus", label: "پاداش" },
  { name: "deductions", label: "کسورات" },
] as const;

export function PayslipForm({ action, initial }: { action: Action; initial: Record<(typeof FIELDS)[number]["name"] | "note", string> }) {
  const [state, formAction, pending] = useFormAction(action);
  const v = { ...initial, ...(state.ok ? {} : state.values) };
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <Field key={f.name} label={`${f.label} (تومان)`} htmlFor={`slip-${f.name}`} error={state.errors?.[f.name]}>
            <Input id={`slip-${f.name}`} name={f.name} inputMode="numeric" dir="ltr" defaultValue={v[f.name]} />
          </Field>
        ))}
      </div>
      <Field label="یادداشت روی فیش" htmlFor="slip-note">
        <Input id="slip-note" name="note" defaultValue={v.note} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>ذخیره</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function PayForm({ action, accounts, today }: { action: Action; accounts: { id: string; name: string }[]; today: string }) {
  const [state, formAction, pending] = useFormAction(action);
  if (accounts.length === 0) return <p className="text-sm text-muted-foreground">اول در بخش مالی یک حساب بانکی یا صندوق بسازید.</p>;
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <Field label="از حساب" htmlFor="pay-account" error={state.errors?.accountId}>
        <Select id="pay-account" name="accountId" defaultValue={accounts[0].id}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </Field>
      <Field label="تاریخ پرداخت" htmlFor="pay-day" error={state.errors?.day}>
        <JalaliDateField id="pay-day" name="day" defaultDate={today} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>ثبت پرداخت</Button>
        <Message state={state} />
      </div>
    </form>
  );
}
