"use client";

import { Button, Input } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

export function AddMilestone({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="mt-3 flex gap-2">
      <Input name="title" placeholder="مرحله جدید…" aria-label="مرحله جدید" />
      <Button type="submit" variant="outline" disabled={pending}>افزودن</Button>
    </form>
  );
}
