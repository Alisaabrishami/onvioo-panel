"use client";

import { Check, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { LEAD_SOURCE_LABELS } from "@/lib/crm";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>;
}

export type LeadInitial = Partial<Record<"name" | "business" | "phone" | "instagram" | "source" | "value" | "services" | "ownerId" | "nextFollowUp" | "notes", string>>;

export function LeadForm({ action, team, initial = {}, submitLabel, compact }: { action: Action; team: Option[]; initial?: LeadInitial; submitLabel: string; compact?: boolean }) {
  const [state, formAction, pending] = useFormAction(action);
  // The quick-add form empties after a save; the edit form keeps what was saved
  const v: LeadInitial = state.ok && compact ? {} : { ...initial, ...state.values };
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="نام" htmlFor="lead-name" error={state.errors?.name}>
          <Input id="lead-name" name="name" defaultValue={v.name} />
        </Field>
        <Field label="کسب‌وکار" htmlFor="lead-business">
          <Input id="lead-business" name="business" placeholder="مثلاً کافه رز" defaultValue={v.business} />
        </Field>
        <Field label="موبایل" htmlFor="lead-phone" error={state.errors?.phone}>
          <Input id="lead-phone" name="phone" inputMode="tel" dir="ltr" defaultValue={v.phone} />
        </Field>
        <Field label="اینستاگرام" htmlFor="lead-instagram" error={state.errors?.instagram}>
          <Input id="lead-instagram" name="instagram" dir="ltr" placeholder="@page" defaultValue={v.instagram} />
        </Field>
        <Field label="از کجا آمد" htmlFor="lead-source">
          <Select id="lead-source" name="source" defaultValue={v.source ?? "instagram"}>
            {Object.entries(LEAD_SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="ارزش تخمینی ماهانه (تومان)" htmlFor="lead-value" error={state.errors?.value}>
          <Input id="lead-value" name="value" inputMode="numeric" dir="ltr" defaultValue={v.value} />
        </Field>
        {!compact && (
          <>
            <Field label="خدمات مورد نیاز" htmlFor="lead-services">
              <Input id="lead-services" name="services" placeholder="مثلاً ریلز ماهانه + سایت" defaultValue={v.services} />
            </Field>
            <Field label="مسئول پیگیری" htmlFor="lead-owner">
              <Select id="lead-owner" name="ownerId" defaultValue={v.ownerId ?? ""}>
                <option value="">خودم</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          </>
        )}
        <Field label="پیگیری بعدی" htmlFor="lead-follow" error={state.errors?.nextFollowUp}>
          <JalaliDateField id="lead-follow" name="nextFollowUp" defaultDate={v.nextFollowUp} />
        </Field>
      </div>
      {!compact && (
        <Field label="یادداشت" htmlFor="lead-notes">
          <Textarea id="lead-notes" name="notes" defaultValue={v.notes} className="min-h-16" />
        </Field>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{submitLabel}</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function ActivityForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Select name="kind" defaultValue={v.kind ?? "call"} aria-label="نوع">
          <option value="call">تماس</option>
          <option value="message">پیام</option>
          <option value="meeting">جلسه</option>
          <option value="note">یادداشت</option>
        </Select>
        <Input id="act-body" name="body" placeholder="چه گفتید؟ نتیجه چه شد؟" defaultValue={v.body} aria-label="شرح" />
      </div>
      {state.errors?.body && <p className="text-xs text-danger">{state.errors.body[0]}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="پیگیری بعدی (اختیاری)" htmlFor="act-follow" error={state.errors?.nextFollowUp}>
          <JalaliDateField id="act-follow" name="nextFollowUp" defaultDate={v.nextFollowUp} />
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>ثبت</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function LostForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="flex flex-wrap items-center gap-2">
      <Input name="reason" placeholder="دلیل (قیمت، زمان، رقیب…)" className="max-w-xs" aria-label="دلیل از دست رفتن" />
      <Button type="submit" variant="ghost" className="text-muted-foreground hover:text-danger" disabled={pending}>از دست رفت</Button>
      <Message state={state} />
    </form>
  );
}

export function DraftMessage({ action }: { action: (state: FormState) => Promise<FormState> }) {
  const [state, formAction, pending] = useFormAction((prev) => action(prev));
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <form action={formAction}>
        <Button type="submit" variant="outline" disabled={pending}>
          <Sparkles className="size-4" />
          {pending ? "در حال نوشتن…" : "پیش‌نویس پیام پیگیری"}
        </Button>
      </form>
      {state.message && !state.ok && <p className="text-sm text-danger">{state.message}</p>}
      {state.ok && state.message && (
        <div className="rounded-2xl bg-muted p-3 text-sm leading-7">
          <p data-testid="draft-message">{state.message}</p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary"
            onClick={() => navigator.clipboard?.writeText(state.message!).then(() => setCopied(true), () => {})}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "کپی شد" : "کپی متن"}
          </button>
        </div>
      )}
    </div>
  );
}
