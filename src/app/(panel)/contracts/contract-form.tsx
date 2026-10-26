"use client";

import { useRef } from "react";
import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CONTRACT_TEMPLATES } from "@/lib/contracts";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

type Option = { id: string; name: string };

export type ContractValues = {
  clientId: string;
  title: string;
  body: string;
  amount: string;
  startsOn: string;
  endsOn: string;
};

export function ContractForm({
  action,
  clients,
  initial,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  clients: Option[];
  initial?: Partial<ContractValues>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const e = state.errors ?? {};
  const v = (f: keyof ContractValues) => state.values?.[f] ?? initial?.[f] ?? "";
  const formRef = useRef<HTMLFormElement>(null);

  function applyTemplate(key: string) {
    const t = CONTRACT_TEMPLATES.find((x) => x.key === key);
    const form = formRef.current;
    if (!t || !form) return;
    const clientId = (form.elements.namedItem("clientId") as HTMLSelectElement).value;
    const clientName = clients.find((c) => c.id === clientId)?.name ?? "[مشتری]";
    (form.elements.namedItem("title") as HTMLInputElement).value = t.title;
    (form.elements.namedItem("body") as HTMLTextAreaElement).value = t.body.replaceAll("[مشتری]", clientName);
  }

  return (
    <form key={state.at} ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="مشتری" htmlFor="clientId" error={e.clientId}>
        <Select id="clientId" name="clientId" defaultValue={v("clientId")} required>
          <option value="">انتخاب کنید</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="شروع از قالب آماده" htmlFor="template">
        <Select id="template" defaultValue="" onChange={(ev) => applyTemplate(ev.target.value)}>
          <option value="">بدون قالب</option>
          {CONTRACT_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="عنوان قرارداد" htmlFor="title" error={e.title}>
          <Input id="title" name="title" defaultValue={v("title")} required />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="متن قرارداد" htmlFor="body" error={e.body}>
          <Textarea id="body" name="body" defaultValue={v("body")} rows={16} className="leading-7" required />
        </Field>
      </div>
      <Field label="مبلغ کل (تومان)" htmlFor="amount" error={e.amount}>
        <Input id="amount" name="amount" inputMode="numeric" defaultValue={v("amount")} placeholder="۲۵۰۰۰۰۰۰" className="ltr text-right" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="شروع" htmlFor="startsOn" error={e.startsOn}>
          <JalaliDateField id="startsOn" name="startsOn" defaultDate={v("startsOn")} />
        </Field>
        <Field label="پایان" htmlFor="endsOn" error={e.endsOn}>
          <JalaliDateField id="endsOn" name="endsOn" defaultDate={v("endsOn")} />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "در حال ذخیره…" : submitLabel}
        </Button>
        {state.message && <span className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</span>}
      </div>
    </form>
  );
}
