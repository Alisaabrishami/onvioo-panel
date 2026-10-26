"use client";

import { useActionState } from "react";
import type { FormState } from "./forms";

// useActionState plus a stamp on every response. React resets a form after
// its action runs, and a reset <select> falls back to the option it had when
// it mounted, so forms are keyed by `at` to remount with the returned values.
export function useFormAction(action: (state: FormState, formData: FormData) => Promise<FormState>) {
  return useActionState<FormState & { at?: number }, FormData>(
    async (prev, formData) => ({ ...(await action(prev, formData)), at: Date.now() }),
    {},
  );
}
