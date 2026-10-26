"use client";

import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";
import { TYPE_LABELS } from "@/lib/content";

type Option = { id: string; name: string };

export type ContentValues = {
  title: string;
  clientId: string;
  type: string;
  assigneeId: string;
  shootId: string;
  dueAt: string;
  dueAtTime: string;
  publishAt: string;
  publishAtTime: string;
  caption: string;
  hashtags: string;
  notes: string;
};

export function ContentForm({
  action,
  initial,
  clients,
  team,
  shoots,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: Partial<ContentValues>;
  clients: Option[];
  team: Option[];
  shoots: Option[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  const e = state.errors ?? {};
  const v = (field: keyof ContentValues) => state.values?.[field] ?? initial?.[field] ?? "";

  return (
    <form key={state.at} action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="عنوان" htmlFor="title" error={e.title}>
          <Input id="title" name="title" defaultValue={v("title")} placeholder="مثلاً ریلز معرفی منوی پاییزه" required />
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
      <Field label="نوع" htmlFor="type" error={e.type}>
        <Select id="type" name="type" defaultValue={v("type") || "reel"}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>
      <Field label="مسئول (تدوینگر)" htmlFor="assigneeId" error={e.assigneeId}>
        <Select id="assigneeId" name="assigneeId" defaultValue={v("assigneeId")}>
          <option value="">بدون مسئول</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="جلسه ضبط" htmlFor="shootId" error={e.shootId}>
        <Select id="shootId" name="shootId" defaultValue={v("shootId")}>
          <option value="">بدون جلسه ضبط</option>
          {shoots.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="مهلت مرحله فعلی" htmlFor="dueAt" error={e.dueAt}>
        <JalaliDateField id="dueAt" name="dueAt" withTime defaultDate={v("dueAt")} defaultTime={v("dueAtTime")} />
      </Field>
      <Field label="زمان انتشار" htmlFor="publishAt" error={e.publishAt}>
        <JalaliDateField id="publishAt" name="publishAt" withTime defaultDate={v("publishAt")} defaultTime={v("publishAtTime")} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="کپشن" htmlFor="caption" error={e.caption}>
          <Textarea id="caption" name="caption" defaultValue={v("caption")} rows={4} />
        </Field>
      </div>
      <Field label="هشتگ‌ها" htmlFor="hashtags" error={e.hashtags}>
        <Input id="hashtags" name="hashtags" defaultValue={v("hashtags")} placeholder="#کافه #تهران" />
      </Field>
      <Field label="یادداشت داخلی" htmlFor="notes" error={e.notes}>
        <Input id="notes" name="notes" defaultValue={v("notes")} />
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
