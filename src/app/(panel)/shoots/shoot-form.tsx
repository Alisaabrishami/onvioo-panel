"use client";

import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

type Option = { id: string; name: string };

export type ShootValues = {
  title: string;
  clientId: string;
  startsAt: string;
  startsAtTime: string;
  durationMinutes: string;
  location: string;
  crewId: string;
  script: string;
  checklist: string;
  notes: string;
};


export function ShootForm({
  action,
  initial,
  clients,
  team,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: Partial<ShootValues>;
  clients: Option[];
  team: Option[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const e = state.errors ?? {};
  const v = (field: keyof ShootValues) => state.values?.[field] ?? initial?.[field] ?? "";

  return (
    <form key={state.at} action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="عنوان جلسه" htmlFor="title" error={e.title}>
          <Input id="title" name="title" defaultValue={v("title")} placeholder="مثلاً ضبط ریلزهای منوی جدید" required />
        </Field>
      </div>
      <Field label="مشتری" htmlFor="clientId" error={e.clientId}>
        <Select id="clientId" name="clientId" defaultValue={v("clientId")} required>
          <option value="">انتخاب کنید</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="تصویربردار" htmlFor="crewId" error={e.crewId}>
        <Select id="crewId" name="crewId" defaultValue={v("crewId")}>
          <option value="">مشخص نشده</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="تاریخ و ساعت" htmlFor="startsAt" error={e.startsAt}>
        <JalaliDateField id="startsAt" name="startsAt" withTime defaultDate={v("startsAt")} defaultTime={v("startsAtTime")} />
      </Field>
      <Field label="مدت (دقیقه)" htmlFor="durationMinutes" error={e.durationMinutes}>
        <Input id="durationMinutes" name="durationMinutes" inputMode="numeric" defaultValue={v("durationMinutes") || "120"} className="ltr text-right" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="محل" htmlFor="location" error={e.location}>
          <Input id="location" name="location" defaultValue={v("location")} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="سناریو / شات‌لیست" htmlFor="script" error={e.script}>
          <Textarea id="script" name="script" defaultValue={v("script")} rows={5} placeholder="شات ۱: نمای باز از ورودی…" />
        </Field>
      </div>
      <Field label="چک‌لیست تجهیزات (هر خط یک مورد)" htmlFor="checklist" error={e.checklist}>
        <Textarea id="checklist" name="checklist" defaultValue={v("checklist")} rows={5} />
      </Field>
      <Field label="یادداشت" htmlFor="notes" error={e.notes}>
        <Textarea id="notes" name="notes" defaultValue={v("notes")} rows={5} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "در حال ذخیره…" : submitLabel}
        </Button>
        {state.message && <span className="text-sm text-success">{state.message}</span>}
      </div>
    </form>
  );
}
