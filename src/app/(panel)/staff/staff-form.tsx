"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createStaff, type FormState } from "./actions";
import { PAY_TYPE_LABELS } from "./labels";

export function StaffForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createStaff, {});
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.errors ?? {};
  const v = state.values ?? {};

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <Field label="نام" htmlFor="name" error={e.name}>
        <Input id="name" name="name" defaultValue={v.name} required />
      </Field>
      <Field label="شماره موبایل" htmlFor="phone" error={e.phone}>
        <Input id="phone" name="phone" inputMode="tel" defaultValue={v.phone} className="ltr text-right" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="نقش" htmlFor="role" error={e.role}>
          <Select id="role" name="role" defaultValue={v.role ?? "staff"}>
            <option value="staff">کارمند</option>
            <option value="admin">مدیر</option>
          </Select>
        </Field>
        <Field label="سمت" htmlFor="title" error={e.title}>
          <Input id="title" name="title" defaultValue={v.title} placeholder="تدوینگر" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="نوع حقوق" htmlFor="payType" error={e.payType}>
          <Select id="payType" name="payType" defaultValue={v.payType ?? "monthly"}>
            {Object.entries(PAY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="مبلغ (تومان)" htmlFor="rate" error={e.rate}>
          <Input id="rate" name="rate" inputMode="numeric" defaultValue={v.rate ?? "0"} className="ltr text-right" />
        </Field>
      </div>
      <Field label="رمز عبور (اختیاری)" htmlFor="password" error={e.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" placeholder="بدون رمز، فقط با کد پیامکی" />
      </Field>
      {state.message && <p className="text-xs text-success">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        افزودن به تیم
      </Button>
    </form>
  );
}
