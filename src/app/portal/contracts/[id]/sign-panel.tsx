"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { toPersianDigits } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";

export function SignPanel({
  phone,
  sendCode,
  sign,
}: {
  phone: string;
  sendCode: () => Promise<{ ok: boolean; error?: string }>;
  sign: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useFormAction(sign);
  const [codeSent, setCodeSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const e = state.errors ?? {};

  const requestCode = () =>
    startSending(async () => {
      const res = await sendCode();
      setSendError(res.ok ? null : (res.error ?? "خطا"));
      if (res.ok) setCodeSent(true);
    });

  return (
    <form key={state.at} action={formAction} className="space-y-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-5 print:hidden">
      <h2 className="font-semibold">امضای قرارداد</h2>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" className="mt-1.5 size-4" />
        متن کامل قرارداد را خواندم و آن را می‌پذیرم.
      </label>
      {e.agree && <p className="text-xs text-danger">{e.agree[0]}</p>}
      <Field label="نام و نام خانوادگی امضاکننده" htmlFor="signerName" error={e.signerName}>
        <Input id="signerName" name="signerName" defaultValue={state.values?.signerName} autoComplete="name" />
      </Field>
      {!codeSent ? (
        <Button type="button" onClick={requestCode} disabled={sending}>
          {sending ? "در حال ارسال کد…" : `ارسال کد امضا به ${toPersianDigits(phone)}`}
        </Button>
      ) : (
        <>
          <Field label={`کد ۶ رقمی پیامک‌شده به ${toPersianDigits(phone)}`} htmlFor="code" error={e.code}>
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="ltr w-40 text-center tracking-[0.4em]" />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>{pending ? "در حال امضا…" : "امضای قرارداد"}</Button>
            <button type="button" onClick={requestCode} disabled={sending} className="text-xs text-muted-foreground hover:underline">
              کد نرسید؟ ارسال دوباره
            </button>
          </div>
        </>
      )}
      {(sendError || state.message) && <p className="text-sm text-danger">{sendError ?? state.message}</p>}
    </form>
  );
}
