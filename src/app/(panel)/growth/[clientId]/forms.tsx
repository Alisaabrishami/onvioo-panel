"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { JalaliDateField } from "@/components/jalali-date-field";
import { Button, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { TYPE_LABELS } from "@/lib/content";
import { useFormAction } from "@/lib/use-form-action";
import type { TrendIdeas } from "@/lib/growth-ai";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type AccountOption = { id: string; username: string };

function Message({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-danger"}>{state.message}</p>;
}

export function AddAccountForm({ action, hasOwn }: { action: Action; hasOwn: boolean }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <Field label="نام کاربری یا لینک پیج" htmlFor="ig-username" error={state.errors?.username}>
          <Input id="ig-username" name="username" dir="ltr" placeholder="cafe.sample" defaultValue={state.ok ? "" : state.values?.username} />
        </Field>
        <Field label="نوع" htmlFor="ig-kind">
          <Select id="ig-kind" name="kind" defaultValue={state.values?.kind ?? (hasOwn ? "competitor" : "own")}>
            <option value="own">پیج خود مشتری</option>
            <option value="competitor">رقیب</option>
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          <Plus className="size-4" />
          افزودن پیج
        </Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function ConnectForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="mt-3 space-y-3 rounded-xl bg-muted/50 p-3">
      <Field label="شناسه حساب اینستاگرام (Instagram Business Account ID)" htmlFor="ig-user-id" error={state.errors?.igUserId}>
        <Input id="ig-user-id" name="igUserId" dir="ltr" inputMode="numeric" defaultValue={state.values?.igUserId} />
      </Field>
      <Field label="توکن دسترسی بلندمدت" htmlFor="ig-token" error={state.errors?.token}>
        <Input id="ig-token" name="token" dir="ltr" type="password" autoComplete="off" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "در حال اتصال…" : "اتصال"}</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function DailyEntryForm({ action, accounts, today }: { action: Action; accounts: AccountOption[]; today: string }) {
  const [state, formAction, pending] = useFormAction(action);
  const v = state.ok ? {} : (state.values ?? {});
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="پیج" htmlFor="daily-account">
          <Select id="daily-account" name="accountId" defaultValue={v.accountId ?? accounts[0]?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </Select>
        </Field>
        <Field label="تاریخ" htmlFor="daily-day" error={state.errors?.day}>
          <JalaliDateField id="daily-day" name="day" defaultDate={v.day ?? today} />
        </Field>
        <Field label="فالوور" htmlFor="daily-followers" error={state.errors?.followers}>
          <Input id="daily-followers" name="followers" inputMode="numeric" defaultValue={v.followers} />
        </Field>
        <Field label="بازدید روز (اختیاری)" htmlFor="daily-views" error={state.errors?.views}>
          <Input id="daily-views" name="views" inputMode="numeric" defaultValue={v.views} />
        </Field>
      </div>
      <input type="hidden" name="reach" value="" />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>ثبت آمار</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

const DAILY_TEMPLATE = "date,followers,reach,views\n1405/07/20,12000,3400,8900\n";
const POSTS_TEMPLATE = "date,link,type,views,likes,comments,saves,shares,caption\n1405/07/20,https://www.instagram.com/reel/XXXX/,reel,15400,820,64,120,45,متن کپشن\n";

function templateHref(text: string) {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${text}`)}`;
}

export function CsvImportForm({ action, accounts }: { action: Action; accounts: AccountOption[] }) {
  const [state, formAction, pending] = useFormAction(action);
  return (
    <form key={state.at} action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="پیج" htmlFor="csv-account">
          <Select id="csv-account" name="accountId" defaultValue={state.values?.accountId ?? accounts[0]?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>@{a.username}</option>
            ))}
          </Select>
        </Field>
        <Field label="نوع فایل" htmlFor="csv-kind">
          <Select id="csv-kind" name="kind" defaultValue={state.values?.kind ?? "daily"}>
            <option value="daily">آمار روزانه پیج</option>
            <option value="posts">آمار پست‌ها</option>
          </Select>
        </Field>
      </div>
      <Field label="فایل CSV" htmlFor="csv-file" error={state.errors?.file}>
        <Input id="csv-file" name="file" type="file" accept=".csv,text/csv,text/plain" className="pt-2" />
      </Field>
      <p className="text-xs text-muted-foreground">
        نمونه فایل:{" "}
        <a href={templateHref(DAILY_TEMPLATE)} download="daily-template.csv" className="text-primary hover:underline">آمار روزانه</a>
        {" · "}
        <a href={templateHref(POSTS_TEMPLATE)} download="posts-template.csv" className="text-primary hover:underline">آمار پست‌ها</a>
        . تاریخ شمسی یا میلادی و عنوان ستون فارسی یا انگلیسی قبول است.
      </p>
      <p className="text-xs text-muted-foreground">
        از Meta Business Suite: بخش Insights، سپس Content، دکمه Export data و فایل CSV؛ آن را با نوع «آمار پست‌ها» وارد کنید.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "در حال ورود…" : "ورود فایل"}</Button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function IdeaList({
  ideas,
  toContent,
}: {
  ideas: TrendIdeas["ideas"];
  toContent: (index: number) => Promise<{ ok: boolean; id?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState<Record<number, string>>({});
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {ideas.map((idea, i) => (
        <li key={i} className="flex flex-col rounded-xl border border-border p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="font-medium">{idea.title}</h3>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{TYPE_LABELS[idea.format]}</span>
          </div>
          <p className="text-sm"><span className="text-muted-foreground">هوک: </span>{idea.hook}</p>
          <p className="mt-1 flex-1 text-xs leading-6 text-muted-foreground">{idea.why}</p>
          {added[i] ? (
            <Button type="button" variant="ghost" className="mt-3 self-start text-success" onClick={() => router.push(`/content/${added[i]}`)}>
              به بورد اضافه شد؛ باز کردن
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mt-3 self-start"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await toContent(i);
                  if (res.ok && res.id) setAdded((a) => ({ ...a, [i]: res.id! }));
                })
              }
            >
              <Plus className="size-4" />
              افزودن به ایده‌های بورد
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
