"use client";

import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { PROJECT_STATUS_LABELS, SERVICE_KIND_LABELS } from "@/lib/services";
import { useFormAction } from "@/lib/use-form-action";

type Option = { id: string; name: string };

export type ProjectValues = {
  clientId: string;
  title: string;
  kind: string;
  status: string;
  url: string;
  ownerId: string;
  startsOn: string;
  dueOn: string;
  notes: string;
};

export function ProjectForm({
  action,
  clients,
  team,
  initial,
  submitLabel,
  isNew = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  clients: Option[];
  team: Option[];
  initial?: Partial<ProjectValues>;
  submitLabel: string;
  isNew?: boolean;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const e = state.errors ?? {};
  const v = (f: keyof ProjectValues) => state.values?.[f] ?? initial?.[f] ?? "";

  return (
    <form key={state.at} action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="عنوان پروژه" htmlFor="title" error={e.title}>
          <Input id="title" name="title" defaultValue={v("title")} placeholder="مثلاً سایت فروشگاهی کافه" required />
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
      <Field label="نوع خدمت" htmlFor="kind" error={e.kind}>
        <Select id="kind" name="kind" defaultValue={v("kind") || "website"}>
          {Object.entries(SERVICE_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>
      <Field label="وضعیت" htmlFor="status" error={e.status}>
        <Select id="status" name="status" defaultValue={v("status") || "planning"}>
          {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>
      <Field label="مسئول پروژه" htmlFor="ownerId" error={e.ownerId}>
        <Select id="ownerId" name="ownerId" defaultValue={v("ownerId")}>
          <option value="">مشخص نشده</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="آدرس سایت" htmlFor="url" error={e.url}>
        <Input id="url" name="url" defaultValue={v("url")} placeholder="https://" className="ltr text-right" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="شروع" htmlFor="startsOn" error={e.startsOn}>
          <JalaliDateField id="startsOn" name="startsOn" defaultDate={v("startsOn")} />
        </Field>
        <Field label="موعد تحویل" htmlFor="dueOn" error={e.dueOn}>
          <JalaliDateField id="dueOn" name="dueOn" defaultDate={v("dueOn")} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="یادداشت داخلی" htmlFor="notes" error={e.notes}>
          <Textarea id="notes" name="notes" defaultValue={v("notes")} />
        </Field>
      </div>
      {isNew && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="withMilestones" defaultChecked className="size-4" />
          مراحل استاندارد این نوع خدمت را اضافه کن
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "در حال ذخیره…" : submitLabel}</Button>
        {state.message && <span className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</span>}
      </div>
    </form>
  );
}
