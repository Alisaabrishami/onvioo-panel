"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";

export function CommentForm({
  action,
  allowInternal = false,
  placeholder = "نظر یا اصلاحیه…",
  submitLabel = "ثبت نظر",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  // Team view: lets a comment be hidden from the client
  allowInternal?: boolean;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const e = state.errors ?? {};

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <Textarea name="body" placeholder={placeholder} defaultValue={state.ok ? "" : state.values?.body} rows={2} aria-label="متن نظر" />
      {e.body && <p className="text-xs text-danger">{e.body[0]}</p>}
      <div className="flex items-center gap-2">
        <Input name="timecode" placeholder="ثانیه ۰:۱۵" defaultValue={state.ok ? "" : state.values?.timecode} className="ltr w-28 text-center" aria-label="زمان در ویدیو" />
        {allowInternal && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" name="internal" className="size-3.5" />
            فقط تیم ببیند
          </label>
        )}
        <Button type="submit" disabled={pending} className="mr-auto">
          {pending ? "در حال ارسال…" : submitLabel}
        </Button>
      </div>
      {e.timecode && <p className="text-xs text-danger">{e.timecode[0]}</p>}
      {state.message && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
