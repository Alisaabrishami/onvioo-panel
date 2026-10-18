"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { addPortalUser, type FormState } from "../actions";

export function PortalUserForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    addPortalUser.bind(null, clientId),
    {},
  );
  const e = state.errors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-3">
      <Field label="نام" htmlFor="portal-name" error={e.name}>
        <Input id="portal-name" name="name" defaultValue={v.name} required />
      </Field>
      <Field label="شماره موبایل" htmlFor="portal-phone" error={e.phone}>
        <Input id="portal-phone" name="phone" inputMode="tel" defaultValue={v.phone} className="ltr text-right" required />
      </Field>
      {state.message && <p className="text-xs text-success">{state.message}</p>}
      <Button type="submit" variant="outline" className="w-full" disabled={pending}>
        افزودن دسترسی
      </Button>
    </form>
  );
}
