"use client";

import { Button, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

export function ReplyForm({
  action,
  placeholder = "پاسخ…",
  submitLabel = "ارسال پاسخ",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="space-y-2">
      <Textarea name="body" rows={3} placeholder={placeholder} defaultValue={state.ok ? "" : state.values?.body} aria-label="متن پیام" />
      {(state.errors?.body || state.message) && <p className="text-xs text-danger">{state.errors?.body?.[0] ?? state.message}</p>}
      <Button type="submit" disabled={pending}>{pending ? "در حال ارسال…" : submitLabel}</Button>
    </form>
  );
}
