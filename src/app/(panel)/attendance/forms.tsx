"use client";

import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";
import { LEAVE_KIND_LABELS } from "@/lib/team";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>;
}

export function LeaveForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <Field label="نوع" htmlFor="leave-kind">
        <Select id="leave-kind" name="kind" defaultValue={v.kind ?? "annual"}>
          {Object.entries(LEAVE_KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="از" htmlFor="leave-start" error={state.errors?.startsOn}>
          <JalaliDateField id="leave-start" name="startsOn" defaultDate={v.startsOn} />
        </Field>
        <Field label="تا" htmlFor="leave-end" error={state.errors?.endsOn}>
          <JalaliDateField id="leave-end" name="endsOn" defaultDate={v.endsOn} />
        </Field>
      </div>
      <Field label="توضیح (اختیاری)" htmlFor="leave-reason">
        <Textarea id="leave-reason" name="reason" defaultValue={v.reason} className="min-h-16" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>ثبت درخواست</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function StretchForm({ action, team, clients, today }: { action: Action; team: Option[]; clients: Option[]; today: string }) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نفر" htmlFor="st-user" error={state.errors?.userId}>
          <Select id="st-user" name="userId" defaultValue={v.userId ?? ""}>
            <option value="">انتخاب کنید</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="تاریخ" htmlFor="st-day" error={state.errors?.day}>
          <JalaliDateField id="st-day" name="day" defaultDate={v.day ?? today} />
        </Field>
        <Field label="از ساعت" htmlFor="st-from" error={state.errors?.from}>
          <Input id="st-from" name="from" dir="ltr" placeholder="09:00" defaultValue={v.from} />
        </Field>
        <Field label="تا ساعت" htmlFor="st-to" error={state.errors?.to}>
          <Input id="st-to" name="to" dir="ltr" placeholder="17:00" defaultValue={v.to} />
        </Field>
        <Field label="مشتری (اختیاری)" htmlFor="st-client">
          <Select id="st-client" name="clientId" defaultValue={v.clientId ?? ""}>
            <option value="">کار عمومی</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="یادداشت" htmlFor="st-note">
          <Input id="st-note" name="note" defaultValue={v.note} placeholder="مثلاً ورود ثبت نشده بود" />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>افزودن بازه</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function CloseStretchForm({ id, action, day }: { id: string; action: Action; day: string }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="day" value={day} />
      <Field label={`پایان در ${day}`} htmlFor={`close-${id}`} error={state.errors?.to}>
        <Input id={`close-${id}`} name="to" dir="ltr" placeholder="18:00" className="w-28" defaultValue={state.values?.to} />
      </Field>
      <Button type="submit" variant="outline" disabled={pending} className="h-10">بستن</Button>
      <Message state={state} />
    </form>
  );
}
