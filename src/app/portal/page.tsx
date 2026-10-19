import { and, asc, count, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { CalendarClock, ChevronLeft, FileSignature, LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { TYPE_LABELS } from "@/lib/content";
import { formatJalaliLong, formatTime, toPersianDigits } from "@/lib/format";
import { CLIENT_STAGE_LABELS } from "./content/progress";

export const metadata: Metadata = { title: "پرتال مشتری" };

export default async function PortalHome() {
  const user = await requireClient();
  const now = new Date();
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
  const [waiting, toSign, [openTickets], upcoming, [inProduction]] = await Promise.all([
    db
      .select({ id: schema.contents.id, title: schema.contents.title, type: schema.contents.type })
      .from(schema.contents)
      .where(and(eq(schema.contents.clientId, user.clientId), eq(schema.contents.stage, "client_review")))
      .orderBy(asc(schema.contents.updatedAt)),
    db
      .select({ id: schema.contracts.id, title: schema.contracts.title })
      .from(schema.contracts)
      .where(and(eq(schema.contracts.clientId, user.clientId), eq(schema.contracts.status, "sent"))),
    db
      .select({ value: count() })
      .from(schema.tickets)
      .where(and(eq(schema.tickets.clientId, user.clientId), ne(schema.tickets.status, "closed"))),
    db
      .select({ id: schema.contents.id, title: schema.contents.title, stage: schema.contents.stage, publishAt: schema.contents.publishAt })
      .from(schema.contents)
      .where(and(eq(schema.contents.clientId, user.clientId), gte(schema.contents.publishAt, now), lt(schema.contents.publishAt, twoWeeks), ne(schema.contents.stage, "idea")))
      .orderBy(asc(schema.contents.publishAt))
      .limit(10),
    db
      .select({ value: count() })
      .from(schema.contents)
      .where(and(eq(schema.contents.clientId, user.clientId), inArray(schema.contents.stage, ["shot", "editing", "internal_review"]))),
  ]);

  const nothingPending = waiting.length === 0 && toSign.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">سلام {user.name}</h1>
        <p className="text-sm text-muted-foreground">
          {nothingPending ? "فعلاً کاری منتظر شما نیست." : "چند مورد منتظر نظر شماست."}
        </p>
      </div>

      {waiting.length > 0 && (
        <section className="rounded-xl border-2 border-warning/40 bg-warning/5 p-4">
          <h2 className="mb-2 font-semibold">منتظر تأیید شما ({toPersianDigits(waiting.length)})</h2>
          <ul className="space-y-1">
            {waiting.map((c) => (
              <li key={c.id}>
                <Link href={`/portal/content/${c.id}`} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm hover:text-primary">
                  <span>{c.title} <span className="text-xs text-muted-foreground">({TYPE_LABELS[c.type]})</span></span>
                  <ChevronLeft className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {toSign.length > 0 && (
        <section className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><FileSignature className="size-4" />قرارداد منتظر امضا</h2>
          <ul className="space-y-1">
            {toSign.map((c) => (
              <li key={c.id}>
                <Link href={`/portal/contracts/${c.id}`} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-sm hover:text-primary">
                  {c.title}
                  <ChevronLeft className="size-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/portal/content">
          <Card className="h-full transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/50">
            <p className="text-sm text-muted-foreground">در حال تولید</p>
            <p className="text-2xl font-bold">{toPersianDigits(inProduction.value)} محتوا</p>
          </Card>
        </Link>
        <Link href="/portal/tickets">
          <Card className="h-full transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/50">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><LifeBuoy className="size-4" />تیکت‌های باز</p>
            <p className="text-2xl font-bold">{toPersianDigits(openTickets.value)}</p>
          </Card>
        </Link>
      </div>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarClock className="size-4" />انتشارهای دو هفته آینده</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">انتشاری برای دو هفته آینده برنامه‌ریزی نشده است.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {upcoming.map((c) => (
              <li key={c.id}>
                <Link href={`/portal/content/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">
                  <span>
                    {c.title}
                    <span className="block text-xs text-muted-foreground">{CLIENT_STAGE_LABELS[c.stage]}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatJalaliLong(c.publishAt!)} · {formatTime(c.publishAt!)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
