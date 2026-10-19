"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  loginWithPassword,
  sendLoginCode,
  verifyLoginCode,
  type LoginState,
} from "./actions";

type Mode = "otp" | "password";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("otp");

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-muted p-1 text-sm">
        {(
          [
            ["otp", "کد پیامکی"],
            ["password", "رمز عبور"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              "rounded-full py-2 font-medium transition-colors duration-200",
              mode === value ? "bg-surface-raised shadow-card" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "otp" ? <OtpForm /> : <PasswordForm />}
    </div>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginWithPassword, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="شماره موبایل" htmlFor="phone">
        <Input id="phone" name="phone" inputMode="tel" autoComplete="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹" defaultValue={state.phone} className="ltr text-right" required />
      </Field>
      <Field label="رمز عبور" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "در حال ورود…" : "ورود"}
      </Button>
    </form>
  );
}

function OtpForm() {
  const [sendState, sendAction, sending] = useActionState<LoginState, FormData>(sendLoginCode, {});
  const [verifyState, verifyAction, verifying] = useActionState<LoginState, FormData>(
    verifyLoginCode,
    {},
  );
  const [editing, setEditing] = useState(false);

  const onCodeStep = sendState.step === "code" && !editing;
  const phone = verifyState.phone ?? sendState.phone ?? "";

  if (!onCodeStep) {
    return (
      <form action={(fd) => { setEditing(false); sendAction(fd); }} className="space-y-4">
        <Field label="شماره موبایل" htmlFor="otp-phone">
          <Input id="otp-phone" name="phone" inputMode="tel" autoComplete="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹" defaultValue={phone} className="ltr text-right" required />
        </Field>
        {sendState.error && <p className="text-sm text-danger">{sendState.error}</p>}
        <Button type="submit" className="w-full" disabled={sending}>
          {sending ? "در حال ارسال…" : "ارسال کد"}
        </Button>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4">
      <input type="hidden" name="phone" value={phone} />
      <p className="text-sm text-muted-foreground">
        {sendState.message ?? sendState.error}{" "}
        <button type="button" onClick={() => setEditing(true)} className="font-medium text-primary">
          تغییر شماره
        </button>
      </p>
      <Field label="کد ورود" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="ltr text-center text-lg tracking-[0.5em]"
          autoFocus
          required
        />
      </Field>
      {verifyState.error && <p className="text-sm text-danger">{verifyState.error}</p>}
      <Button type="submit" className="w-full" disabled={verifying}>
        {verifying ? "در حال بررسی…" : "ورود"}
      </Button>
    </form>
  );
}
