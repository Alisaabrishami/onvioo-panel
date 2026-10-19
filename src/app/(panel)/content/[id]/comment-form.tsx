"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";

export function CommentForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const e = state.errors ?? {};

  return (
    <form ref={ref} action={formAction} className="space-y-2">
      <Textarea name="body" placeholder="نظر یا اصلاحیه…" defaultValue={state.ok ? "" : state.values?.body} rows={2} aria-label="متن نظر" />
      {e.body && <p className="text-xs text-danger">{e.body[0]}</p>}
      <div className="flex items-center gap-2">
        <Input name="timecode" placeholder="ثانیه ۰:۱۵" defaultValue={state.ok ? "" : state.values?.timecode} className="ltr w-28 text-center" aria-label="زمان در ویدیو" />
        <Button type="submit" disabled={pending} className="mr-auto">
          {pending ? "در حال ارسال…" : "ثبت نظر"}
        </Button>
      </div>
      {e.timecode && <p className="text-xs text-danger">{e.timecode[0]}</p>}
    </form>
  );
}
