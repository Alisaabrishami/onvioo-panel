"use client";

import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

export function PayButton({ action, label }: { action: (state: FormState) => Promise<FormState>; label: string }) {
  const [state, formAction, pending] = useFormAction((prev) => action(prev));
  return (
    <form action={formAction} className="space-y-2">
      <Button type="submit" disabled={pending} className="h-12 w-full text-base">
        <CreditCard className="size-5" />
        {pending ? "در حال اتصال به درگاه…" : label}
      </Button>
      {state.message && <p role="status" className="text-center text-sm text-danger">{state.message}</p>}
    </form>
  );
}
