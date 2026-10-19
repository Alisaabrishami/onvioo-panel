"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { ClientStatus } from "@/db/schema";
import { CLIENT_STATUS_LABELS } from "./labels";
import type { FormState } from "./actions";

type ClientValues = {
  name: string;
  brand: string | null;
  instagram: string | null;
  phone: string | null;
  status: ClientStatus;
  notes: string | null;
};

export function ClientForm({
  action,
  initial,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: ClientValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.errors ?? {};
  // After a failed submit, show what was typed instead of the saved values
  const v = (field: keyof ClientValues) => state.values?.[field] ?? initial?.[field] ?? "";

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="نام مشتری" htmlFor="name" error={e.name}>
        <Input id="name" name="name" defaultValue={v("name")} required />
      </Field>
      <Field label="نام برند / کسب‌وکار" htmlFor="brand" error={e.brand}>
        <Input id="brand" name="brand" defaultValue={v("brand")} />
      </Field>
      <Field label="پیج اینستاگرام" htmlFor="instagram" error={e.instagram}>
        <Input id="instagram" name="instagram" defaultValue={v("instagram")} placeholder="@page" className="ltr text-right" />
      </Field>
      <Field label="شماره تماس" htmlFor="phone" error={e.phone}>
        <Input id="phone" name="phone" inputMode="tel" defaultValue={v("phone")} className="ltr text-right" />
      </Field>
      <Field label="وضعیت" htmlFor="status" error={e.status}>
        <Select id="status" name="status" defaultValue={v("status") || "active"}>
          {Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="یادداشت" htmlFor="notes" error={e.notes}>
          <Textarea id="notes" name="notes" defaultValue={v("notes")} />
        </Field>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "در حال ذخیره…" : submitLabel}
        </Button>
        {state.message && <span className="text-sm text-success">{state.message}</span>}
      </div>
    </form>
  );
}
