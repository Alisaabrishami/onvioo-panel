"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

// A one-click server action (generate a report, sync now) that shows its
// pending label while it runs and the action's message afterwards
export function ActionButton({
  action,
  children,
  pendingLabel,
  variant = "outline",
  className,
}: {
  action: (state: FormState) => Promise<FormState>;
  children: React.ReactNode;
  pendingLabel: string;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const [state, formAction, pending] = useFormAction((prev) => action(prev));
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <Button type="submit" variant={variant} disabled={pending} className={className}>
        {pending ? pendingLabel : children}
      </Button>
      {state.message && (
        <p role="status" className={state.ok ? "text-xs text-success" : "text-xs text-danger"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
