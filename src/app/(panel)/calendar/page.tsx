import { and, asc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { Camera, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { STAGE_LABELS, TYPE_LABELS } from "@/lib/content";
import { clientOptions, isUuid } from "@/lib/data";
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS,
  addJalaliMonths,
  formatTime,
  fromJalali,
  jalaliMonthDays,
  jalaliWeekday,
  toJalaliParts,
  toPersianDigits,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "تقویم انتشار" };

type Entry =
  | { kind: "content"; id: string; at: Date; title: string; client: string; label: string; published: boolean }
  | { kind: "shoot"; id: string; at: Date; title: string; client: string };

const pad = (n: number) => String(n).padStart(2, "0");
const monthParam = (m: { jy: number; jm: number }) => `${m.jy}-${pad(m.jm)}`;

export default async function CalendarPage(props: PageProps<"/calendar">) {
  await requireTeam();
  const sp = await props.searchParams;
  const today = toJalaliParts(new Date());
  const match = typeof sp.m === "string" ? sp.m.match(/^(\d{4})-(\d{2})$/) : null;
  const month =
    match && +match[2] >= 1 && +match[2] <= 12 ? { jy: +match[1], jm: +match[2] } : { jy: today.jy, jm: today.jm };
  const clientId = isUuid(sp.client) ? sp.client : null;

  const next = addJalaliMonths(month.jy, month.jm, 1);
  const prev = addJalaliMonths(month.jy, month.jm, -1);
  const from = fromJalali(month.jy, month.jm, 1);
  const to = fromJalali(next.jy, next.jm, 1);

  const [contents, shoots, clients] = await Promise.all([
    db
      .select({
        id: schema.contents.id,
        title: schema.contents.title,
        type: schema.contents.type,
        stage: schema.contents.stage,
        at: schema.contents.publishAt,
        client: schema.clients.name,
      })
      .from(schema.contents)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.contents.clientId))
      .where(
        and(
          isNotNull(schema.contents.publishAt),
          gte(schema.contents.publishAt, from),
          lt(schema.contents.publishAt, to),
          clientId ? eq(schema.contents.clientId, clientId) : undefined,
        ),
      )
      .orderBy(asc(schema.contents.publishAt)),
    db
      .select({ id: schema.shoots.id, title: schema.shoots.title, at: schema.shoots.startsAt, client: schema.clients.name })
      .from(schema.shoots)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.shoots.clientId))
      .where(
        and(
          gte(schema.shoots.startsAt, from),
          lt(schema.shoots.startsAt, to),
          clientId ? eq(schema.shoots.clientId, clientId) : undefined,
        ),
      )
      .orderBy(asc(schema.shoots.startsAt)),
    clientOptions(),
  ]);

  const byDay = new Map<number, Entry[]>();
  const add = (day: number, e: Entry) => byDay.set(day, [...(byDay.get(day) ?? []), e]);
  for (const s of shoots) add(toJalaliParts(s.at).jd, { kind: "shoot", ...s });
  for (const c of contents) {
    add(toJalaliParts(c.at!).jd, {
      kind: "content",
      id: c.id,
      at: c.at!,
      title: c.title,
      client: c.client,
      label: `${TYPE_LABELS[c.type]} · ${STAGE_LABELS[c.stage]}`,
      published: c.stage === "published",
    });
  }
  for (const list of byDay.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());

  const days = jalaliMonthDays(month.jy, month.jm);
  const lead = jalaliWeekday(month.jy, month.jm, 1);
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const isToday = (d: number) => today.jy === month.jy && today.jm === month.jm && today.jd === d;
  const qs = (m: { jy: number; jm: number }) => `/calendar?m=${monthParam(m)}${clientId ? `&client=${clientId}` : ""}`;
  const dateParam = (d: number) => `${month.jy}/${pad(month.jm)}/${pad(d)}`;

  const entryLink = (e: Entry, compact: boolean) => (
    <Link
      key={`${e.kind}${e.id}`}
      href={e.kind === "shoot" ? `/shoots/${e.id}` : `/content/${e.id}`}
      title={`${e.client} · ${e.title}`}
      className={cn(
        "block truncate rounded px-1.5 py-0.5 text-xs",
        e.kind === "shoot"
          ? "bg-warning/15 text-warning"
          : e.published
            ? "bg-success/15 text-success"
            : "bg-primary/15 text-primary",
      )}
    >
      {e.kind === "shoot" && <Camera className="ml-1 inline size-3" />}
      {compact ? e.title : `${formatTime(e.at)} · ${e.client} · ${e.title}`}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="تقویم انتشار"
        description="زمان انتشار محتواها و جلسه‌های ضبط در یک نگاه"
        actions={
          <div className="flex gap-2">
            <Link href="/shoots/new" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-3.5 text-sm hover:bg-muted">
              <Camera className="size-4" />
              جلسه ضبط
            </Link>
            <Link href="/content/new" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow transition-[filter,transform] hover:brightness-105 active:scale-[0.97]">
              <Plus className="size-4" />
              محتوا
            </Link>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={qs(prev)} className="rounded-xl p-2 hover:bg-muted" aria-label="ماه قبل">
            <ChevronRight className="size-5" />
          </Link>
          <h2 className="min-w-32 text-center text-lg font-semibold">
            {JALALI_MONTHS[month.jm - 1]} {toPersianDigits(month.jy)}
          </h2>
          <Link href={qs(next)} className="rounded-xl p-2 hover:bg-muted" aria-label="ماه بعد">
            <ChevronLeft className="size-5" />
          </Link>
          {(month.jy !== today.jy || month.jm !== today.jm) && (
            <Link href={qs(today)} className="mr-2 text-sm text-primary hover:underline">امروز</Link>
          )}
        </div>
        <form className="flex gap-2 text-sm">
          <input type="hidden" name="m" value={monthParam(month)} />
          <select name="client" defaultValue={clientId ?? ""} className="h-9 rounded-full border border-border bg-muted px-3 [&>option]:bg-surface-solid" aria-label="مشتری">
            <option value="">همه مشتری‌ها</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-full border border-border px-3.5 hover:bg-muted">نمایش</button>
        </form>
      </div>

      <div className="hidden overflow-hidden glass rounded-3xl md:block">
        <div className="grid grid-cols-7 border-b border-border bg-muted/50 text-center text-xs font-medium text-muted-foreground">
          {JALALI_WEEKDAYS.map((w) => (
            <div key={w} className="py-2">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div
              key={d ?? `e${i}`}
              className={cn("group min-h-28 border-b border-l border-border p-1.5 [&:nth-child(7n)]:border-l-0", d === null && "bg-muted/30", i % 7 === 6 && d && "bg-muted/20")}
            >
              {d !== null && (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn("flex size-6 items-center justify-center rounded-full text-xs", isToday(d) && "bg-primary font-bold text-primary-foreground")}>
                      {toPersianDigits(d)}
                    </span>
                    <Link href={`/shoots/new?date=${dateParam(d)}`} className="invisible rounded p-0.5 text-muted-foreground hover:text-primary group-hover:visible" title="جلسه ضبط در این روز">
                      <Plus className="size-3.5" />
                    </Link>
                  </div>
                  <div className="space-y-1">{byDay.get(d)?.map((e) => entryLink(e, true))}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {byDay.size === 0 && <p className="py-8 text-center text-sm text-muted-foreground">برای این ماه چیزی برنامه‌ریزی نشده است.</p>}
        {[...byDay.keys()]
          .sort((a, b) => a - b)
          .map((d) => (
            <div key={d} className="glass rounded-3xl p-3">
              <p className={cn("mb-2 text-sm font-semibold", isToday(d) && "text-primary")}>
                {JALALI_WEEKDAYS[jalaliWeekday(month.jy, month.jm, d)]} {toPersianDigits(d)} {JALALI_MONTHS[month.jm - 1]}
              </p>
              <div className="space-y-1.5">{byDay.get(d)!.map((e) => entryLink(e, false))}</div>
            </div>
          ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" />در صف انتشار</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" />منتشر شده</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-warning" />جلسه ضبط</span>
      </div>
    </>
  );
}
