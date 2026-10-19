"use client";

import { useState } from "react";
import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

export function MonitorForm({
  action,
  clients,
  projects,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  clients: { id: string; name: string }[];
  projects: { id: string; clientId: string; title: string; url: string | null }[];
}) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.ok ? {} : (state.values ?? {});
  const [clientId, setClientId] = useState(v.clientId ?? "");
  const [url, setUrl] = useState(v.url ?? "");
  const mine = projects.filter((p) => p.clientId === clientId);
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <Field label="مشتری" htmlFor="mon-client" error={state.errors?.clientId}>
        <Select id="mon-client" name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">انتخاب کنید</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      {mine.length > 0 && (
        <Field label="پروژه سایت (اختیاری)" htmlFor="mon-project">
          <Select
            id="mon-project"
            name="projectId"
            defaultValue=""
            onChange={(e) => {
              const p = mine.find((x) => x.id === e.target.value);
              if (p?.url && !url) setUrl(p.url);
            }}
          >
            <option value="">—</option>
            {mine.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Field>
      )}
      <Field label="آدرس سایت" htmlFor="mon-url" error={state.errors?.url}>
        <Input id="mon-url" name="url" dir="ltr" placeholder="cafe-sample.ir" value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="عبارتی که باید در صفحه باشد (اختیاری)" htmlFor="mon-keyword">
        <Input id="mon-keyword" name="keyword" placeholder="مثلاً نام برند" defaultValue={v.keyword} />
      </Field>
      <Field label="تاریخ انقضای دامنه (اختیاری)" htmlFor="mon-domain" error={state.errors?.domainExpiresOn}>
        <JalaliDateField id="mon-domain" name="domainExpiresOn" defaultDate={v.domainExpiresOn} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "در حال بررسی…" : "افزودن سایت"}</Button>
        {state.message && <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>}
      </div>
    </form>
  );
}
