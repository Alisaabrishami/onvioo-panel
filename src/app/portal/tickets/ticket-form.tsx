"use client";

import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

export function TicketForm({
  action,
  projects,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  projects: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useFormAction(action);
  const e = state.errors ?? {};
  const v = (f: string, fallback = "") => state.values?.[f] ?? fallback;
  return (
    <form key={state.at} action={formAction} className="space-y-4">
      <Field label="موضوع" htmlFor="title" error={e.title}>
        <Input id="title" name="title" defaultValue={v("title")} placeholder="مثلاً فرم تماس سایت کار نمی‌کند" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {projects.length > 0 && (
          <Field label="مربوط به پروژه" htmlFor="projectId" error={e.projectId}>
            <Select id="projectId" name="projectId" defaultValue={v("projectId")}>
              <option value="">عمومی</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="فوریت" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={v("priority", "normal")}>
            <option value="normal">معمولی</option>
            <option value="high">مهم</option>
            <option value="urgent">فوری (سایت از دسترس خارج است)</option>
          </Select>
        </Field>
      </div>
      <Field label="توضیحات" htmlFor="body" error={e.body}>
        <Textarea id="body" name="body" rows={6} defaultValue={v("body")} placeholder="مشکل یا درخواست را با جزئیات بنویسید؛ آدرس صفحه هم اگر هست." />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "در حال ثبت…" : "ثبت تیکت"}</Button>
    </form>
  );
}
