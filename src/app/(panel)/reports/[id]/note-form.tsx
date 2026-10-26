"use client";

import { Button, Textarea } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { saveReportNote } from "../actions";

export function NoteForm({ reportId, note }: { reportId: string; note: string }) {
  const [state, action, pending] = useFormAction(saveReportNote.bind(null, reportId));
  return (
    <form key={state.at} action={action} className="space-y-2">
      <Textarea name="note" aria-label="پیام تیم" rows={4} defaultValue={state.values?.note ?? note} placeholder="مثلاً: ممنون از همکاری‌تان؛ این ماه روی ریلزهای منو تمرکز می‌کنیم." />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending} className="h-8 px-3 text-xs">
          {pending ? "در حال ذخیره…" : "ذخیره پیام"}
        </Button>
        {state.message && <p role="status" className={state.ok ? "text-xs text-success" : "text-xs text-danger"}>{state.message}</p>}
      </div>
    </form>
  );
}
