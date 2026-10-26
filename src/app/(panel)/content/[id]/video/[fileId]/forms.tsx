"use client";

import { Captions, Scissors } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import type { ClipIdea } from "@/db/schema";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p role="status" className={state.ok ? "text-xs text-success" : "text-xs text-danger"}>{state.message}</p>;
}

export function BurnForm({ action, disabled }: { action: Action; disabled: boolean }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="جای زیرنویس" htmlFor="burn-position">
          <Select id="burn-position" name="position" defaultValue="bottom">
            <option value="bottom">پایین تصویر</option>
            <option value="middle">وسط تصویر</option>
          </Select>
        </Field>
        <Field label="اندازه متن" htmlFor="burn-size">
          <Select id="burn-size" name="size" defaultValue="medium">
            <option value="small">کوچک</option>
            <option value="medium">متوسط</option>
            <option value="large">بزرگ</option>
          </Select>
        </Field>
      </div>
      <Button type="submit" variant="outline" disabled={pending || disabled}>
        <Captions className="size-4" />
        {pending ? "در حال ثبت…" : "ساختن نسخه زیرنویس‌دار"}
      </Button>
      <Message state={state} />
    </form>
  );
}

export function ClipForm({ action, idea, index, hasTranscript }: { action: Action; idea: ClipIdea; index: number; hasTranscript: boolean }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="space-y-2">
      <input type="hidden" name="start" value={idea.start} />
      <input type="hidden" name="end" value={idea.end} />
      <input type="hidden" name="hook" value={idea.hook} />
      <Input name="title" defaultValue={idea.title} aria-label={`عنوان کلیپ ${index + 1}`} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="subtitles" defaultChecked={hasTranscript} disabled={!hasTranscript} className="accent-primary" />
          زیرنویس روی کلیپ
        </label>
        <Button type="submit" className="h-9 px-4" disabled={pending}>
          <Scissors className="size-4" />
          {pending ? "در حال ثبت…" : "برش عمودی"}
        </Button>
      </div>
      <Message state={state} />
    </form>
  );
}
