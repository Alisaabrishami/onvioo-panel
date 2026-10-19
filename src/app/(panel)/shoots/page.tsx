import { asc, desc, eq, gte, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Clock, MapPin, Plus, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { JALALI_WEEKDAYS, formatJalaliLong, fromJalali, formatTime, jalaliWeekday, toJalaliParts, toPersianDigits } from "@/lib/format";

export const metadata: Metadata = { title: "جلسه‌های ضبط" };

export default async function ShootsPage() {
  await requireTeam();
  const crew = alias(schema.users, "crew");
  // Today's shoots still count as upcoming until the day is over
  const today = toJalaliParts(new Date());
  const dayStart = fromJalali(today.jy, today.jm, today.jd);
  const select = {
    id: schema.shoots.id,
    title: schema.shoots.title,
    startsAt: schema.shoots.startsAt,
    durationMinutes: schema.shoots.durationMinutes,
    location: schema.shoots.location,
    clientName: schema.clients.name,
    crewName: crew.name,
  };
  const base = () =>
    db
      .select(select)
      .from(schema.shoots)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.shoots.clientId))
      .leftJoin(crew, eq(crew.id, schema.shoots.crewId));
  const [upcoming, past] = await Promise.all([
    base().where(gte(schema.shoots.startsAt, dayStart)).orderBy(asc(schema.shoots.startsAt)),
    base().where(lt(schema.shoots.startsAt, dayStart)).orderBy(desc(schema.shoots.startsAt)).limit(20),
  ]);

  const row = (s: (typeof upcoming)[number]) => {
    const p = toJalaliParts(s.startsAt);
    return (
      <li key={s.id}>
        <Link href={`/shoots/${s.id}`} className="flex gap-4 rounded-lg p-3 hover:bg-muted/60">
          <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-primary/10 py-2 text-primary">
            <span className="text-xs">{JALALI_WEEKDAYS[jalaliWeekday(p.jy, p.jm, p.jd)]}</span>
            <span className="text-lg font-bold">{toPersianDigits(p.jd)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{s.title}</p>
            <p className="text-sm text-muted-foreground">{s.clientName} · {formatJalaliLong(s.startsAt)}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="size-3" />{formatTime(s.startsAt)} · {toPersianDigits(s.durationMinutes)} دقیقه</span>
              {s.location && <span className="flex items-center gap-1"><MapPin className="size-3" />{s.location}</span>}
              {s.crewName && <span className="flex items-center gap-1"><User className="size-3" />{s.crewName}</span>}
            </div>
          </div>
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="جلسه‌های ضبط"
        description="برنامه فیلمبرداری، سناریو و چک‌لیست تجهیزات"
        actions={
          <Link href="/shoots/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" />
            جلسه ضبط جدید
          </Link>
        }
      />
      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState>هنوز جلسه ضبطی برنامه‌ریزی نشده است.</EmptyState>
      ) : (
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 font-semibold">پیش رو</h2>
            {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">جلسه‌ای در پیش نیست.</p> : <ul className="divide-y divide-border">{upcoming.map(row)}</ul>}
          </Card>
          {past.length > 0 && (
            <Card>
              <h2 className="mb-2 font-semibold">گذشته</h2>
              <ul className="divide-y divide-border opacity-80">{past.map(row)}</ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
