import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { ChevronDown, Download, KeyRound, Smartphone, Upload } from "lucide-react";
import type { Metadata } from "next";
import { revokeApp } from "@/app/account-actions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { openapi } from "@/lib/api/openapi";
import { TOKEN_DAYS } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { describeAgent } from "@/lib/devices";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import { sessionRef } from "@/lib/ops/sessions";
import { appUrl } from "@/lib/payment";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "API و اپ موبایل" };

const TAG_LABELS: Record<string, string> = {
  Auth: "ورود و پروفایل",
  Account: "دستگاه‌ها",
  Notifications: "اعلان‌ها",
  Team: "کارهای تیم",
  Client: "مشتری",
  Files: "فایل و آپلود",
  Tickets: "تیکت‌ها",
  Contracts: "قراردادها",
  CRM: "مشتریان بالقوه",
  Payroll: "حقوق",
};

const METHOD_TONES: Record<string, string> = {
  get: "bg-sky text-ink",
  post: "bg-mint text-ink",
  patch: "bg-sand text-ink",
  delete: "bg-coral text-ink",
};

type Operation = { summary?: string; tags?: readonly string[]; "x-roles"?: readonly string[]; security?: readonly unknown[] };

// Endpoints grouped by their first tag, in the order the document lists them
function endpointsByTag() {
  const groups = new Map<string, { method: string; path: string; op: Operation }[]>();
  for (const [path, item] of Object.entries(openapi.paths)) {
    for (const [method, op] of Object.entries(item as Record<string, Operation>)) {
      const tag = op.tags?.[0] ?? "Other";
      groups.set(tag, [...(groups.get(tag) ?? []), { method, path, op }]);
    }
  }
  return [...groups.entries()];
}

export default async function DevelopersPage() {
  await requireAdmin();
  const groups = endpointsByTag();
  const total = groups.reduce((n, [, items]) => n + items.length, 0);
  const apps = await db
    .select({ id: schema.sessions.id, device: schema.sessions.device, userAgent: schema.sessions.userAgent, createdAt: schema.sessions.createdAt, userId: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(isNotNull(schema.sessions.device), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.createdAt))
    .limit(100);
  const base = `${appUrl()}/api/v1`;

  return (
    <>
      <PageHeader
        title="API و اپ موبایل"
        description="همه کارهای پنل از طریق API هم در دسترس است؛ این صفحه برای برنامه‌نویس اپ است"
        actions={
          <a href="/api/v1/openapi.json" download="onvioo-openapi.json" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow">
            <Download className="size-4" />
            دریافت مستند OpenAPI
          </a>
        }
      />
      <div className="max-w-5xl space-y-6">
        <div className="stagger grid gap-3 md:grid-cols-3">
          <Card className="animate-rise space-y-2">
            <KeyRound className="size-5 text-primary" />
            <h2 className="font-semibold">ورود</h2>
            <p className="text-xs leading-6 text-muted-foreground">
              اپ با شماره موبایل و کد پیامکی یا رمز وارد می‌شود و یک توکن {toPersianDigits(TOKEN_DAYS)} روزه می‌گیرد. هر درخواست توکن را در هدر <code dir="ltr">Authorization: Bearer</code> می‌فرستد.
            </p>
          </Card>
          <Card className="animate-rise space-y-2">
            <Upload className="size-5 text-primary" />
            <h2 className="font-semibold">آپلود فایل</h2>
            <p className="text-xs leading-6 text-muted-foreground">
              دو مرحله: <code dir="ltr">/uploads</code> لینک آپلود می‌دهد، اپ فایل را مستقیم به فضای ذخیره‌سازی می‌فرستد و بعد <code dir="ltr">/uploads/complete</code> آن را ثبت می‌کند. فایل‌های حجیم از سرور پنل رد نمی‌شوند.
            </p>
          </Card>
          <Card className="animate-rise space-y-2">
            <Smartphone className="size-5 text-primary" />
            <h2 className="font-semibold">نشانی پایه</h2>
            <p dir="ltr" className="break-all rounded-xl bg-muted px-3 py-2 text-left font-mono text-xs">{base}</p>
            <p className="text-xs leading-6 text-muted-foreground">
              {toPersianDigits(total)} مسیر. پیام‌های خطا فارسی‌اند و اپ می‌تواند مستقیم نشانشان دهد.
            </p>
          </Card>
        </div>

        <Card className="animate-rise space-y-3">
          <div>
            <h2 className="font-semibold">اپ‌های وصل‌شده</h2>
            <p className="mt-1 text-xs text-muted-foreground">هر ورود از اپ اینجا دیده می‌شود. با «قطع» آن اپ همان لحظه از حساب خارج می‌شود.</p>
          </div>
          {apps.length === 0 ? (
            <EmptyState>هنوز هیچ اپی وارد نشده است.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {apps.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <Smartphone className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {a.name}
                      <Badge tone={a.role === "client" ? "info" : "neutral"}>{ROLE_LABELS[a.role]}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[a.device, describeAgent(a.userAgent)].filter(Boolean).join(" · ")} · {formatJalaliDateTime(a.createdAt)}
                    </p>
                  </div>
                  <form action={revokeApp.bind(null, a.userId, sessionRef(a.id))}>
                    <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger">قطع</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <section className="space-y-3">
          <h2 className="font-semibold">فهرست مسیرها</h2>
          {groups.map(([tag, items], i) => (
            <details key={tag} open={i < 2} className="glass group animate-rise rounded-3xl">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span className="flex items-center gap-2 font-medium">
                  {TAG_LABELS[tag] ?? tag}
                  <span className="text-xs font-normal text-muted-foreground">{toPersianDigits(items.length)} مسیر</span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {items.map(({ method, path, op }) => (
                  <li key={`${method} ${path}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                    <span dir="ltr" className="flex min-w-0 items-center gap-2">
                      <span className={cn("w-14 shrink-0 rounded-full px-2 py-0.5 text-center font-mono text-[11px] font-bold uppercase", METHOD_TONES[method])}>{method}</span>
                      <code className="truncate font-mono text-xs">{path}</code>
                    </span>
                    {op.summary && <span dir="ltr" className="min-w-0 flex-1 text-left text-xs text-muted-foreground">{op.summary}</span>}
                    <span className="flex gap-1">
                      {op.security?.length === 0 ? (
                        <Badge tone="neutral">بدون توکن</Badge>
                      ) : (
                        op["x-roles"]?.map((r) => (
                          <Badge key={r} tone="neutral">
                            {ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}
                          </Badge>
                        ))
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      </div>
    </>
  );
}
