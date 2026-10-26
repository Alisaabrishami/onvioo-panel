"use client";

import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select } from "@/components/ui";
import { PRIORITY_LABELS } from "@/lib/content";
import { FOLLOW_UP_EVERY } from "@/lib/follow-up";
import { useFormAction } from "@/lib/use-form-action";
import { createTask } from "./actions";

type Option = { id: string; name: string };

export function TaskForm({ team, clients, me, canFollowUp }: { team: Option[]; clients: Option[]; me: string; canFollowUp: boolean }) {
  const [state, formAction, pending] = useFormAction(createTask);
  const e = state.errors ?? {};
  const v = (f: string, fallback = "") => (state.ok ? fallback : (state.values?.[f] ?? fallback));

  return (
    <form key={state.at} action={formAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1.3fr_auto] lg:items-end">
      <Field label="کار جدید" htmlFor="title" error={e.title}>
        <Input id="title" name="title" defaultValue={v("title")} placeholder="مثلاً هماهنگی ضبط با مشتری" />
      </Field>
      <Field label="مسئول" htmlFor="assigneeId">
        <Select id="assigneeId" name="assigneeId" defaultValue={v("assigneeId", me)}>
          <option value="">بدون مسئول</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="مشتری" htmlFor="clientId">
        <Select id="clientId" name="clientId" defaultValue={v("clientId")}>
          <option value="">—</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="اولویت" htmlFor="priority">
        <Select id="priority" name="priority" defaultValue={v("priority", "normal")}>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>
      <Field label="مهلت" htmlFor="dueAt" error={e.dueAt}>
        <JalaliDateField id="dueAt" name="dueAt" defaultDate={v("dueAt")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "…" : "افزودن"}
      </Button>
      {canFollowUp && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:col-span-2 lg:col-span-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="followUp" defaultChecked={v("followUp") === "on"} className="size-4" />
            دستیار از طرف من پیگیر این کار باشد
          </label>
          <Select name="followUpEvery" aria-label="هر چند وقت بپرسد" defaultValue={v("followUpEvery", "1")} className="h-8 w-auto py-0 text-xs">
            {Object.entries(FOLLOW_UP_EVERY).map(([value, label]) => (
              <option key={value} value={value}>{label} بپرسد</option>
            ))}
          </Select>
          <span className="text-xs text-muted-foreground">نزدیک مهلت و بعد از آن هر روز می‌پرسد و نتیجه را به شما می‌گوید.</span>
        </div>
      )}
    </form>
  );
}
