import { and, desc, eq, gte } from "drizzle-orm";
import { LogIn, LogOut, Repeat, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, PageHeader, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { clientOptions } from "@/lib/data";
import { formatIsoDate, formatJalaliDate, formatTime, isoDateToJalali, jalaliInputValue, toPersianDigits } from "@/lib/format";
import { tehranDay } from "@/lib/growth";
import { STANDARD_MONTH_MINUTES, formatMinutes, minutesWithin, periodLabel, periodOf, periodRange } from "@/lib/payroll";
import { LEAVE_KIND_LABELS, REQUEST_STATUS_LABELS, REQUEST_STATUS_TONES } from "@/lib/team";
import { activeTeam, onLeaveToday, openStretch, pendingLeaves, stretchesBetween } from "@/lib/team-data";
import { addStretch, cancelLeave, clockIn, clockOut, closeStretch, decideLeave, deleteStretch, requestLeave, switchClient } from "./actions";
import { CloseStretchForm, LeaveForm, StretchForm } from "./forms";

export const metadata: Metadata = { title: "حضور و مرخصی" };

export default async function AttendancePage(props: PageProps<"/attendance">) {
  const user = await requireTeam();
  const sp = await props.searchParams;
  const isAdmin = user.role === "admin";
  const now = new Date();
  const period = periodOf(now);
  const { start, end } = periodRange(period);
  const todayStart = new Date(`${tehranDay(now)}T00:00:00+03:30`);

  const [open, clients, mine, leaves, payslips] = await Promise.all([
    openStretch(user.id),
    clientOptions(),
    stretchesBetween(start, end, [user.id]),
    db.select().from(schema.leaveRequests).where(and(eq(schema.leaveRequests.userId, user.id), gte(schema.leaveRequests.endsOn, tehranDay(start)))).orderBy(desc(schema.leaveRequests.startsOn)),
    db.select().from(schema.payslips).where(and(eq(schema.payslips.userId, user.id), eq(schema.payslips.status, "paid"))).orderBy(desc(schema.payslips.period)).limit(6),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const todayMinutes = minutesWithin(mine, todayStart, end, now);
  const monthMinutes = minutesWithin(mine, start, end, now);

  return (
    <>
      <PageHeader title="حضور و مرخصی" description={periodLabel(period)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                {open ? (
                  <>
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="size-2.5 animate-pulse rounded-full bg-success" />
                      سر کار از {formatTime(open.stretch.clockIn)}
                    </p>
                    <p className="text-sm text-muted-foreground">{open.clientName ? `روی ${open.clientName}` : "کار عمومی"}</p>
                  </>
                ) : (
                  <p className="font-semibold">الان سر کار نیستید</p>
                )}
              </div>
              <dl className="flex gap-6 text-center">
                <div>
                  <dt className="text-xs text-muted-foreground">امروز</dt>
                  <dd className="text-lg font-bold">{formatMinutes(todayMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">این ماه</dt>
                  <dd className="text-lg font-bold">{formatMinutes(monthMinutes)}</dd>
                </div>
              </dl>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
              <form action={open ? switchClient : clockIn} className="flex flex-1 flex-wrap items-end gap-2">
                <label className="min-w-48 flex-1">
                  <span className="mb-1.5 block text-sm font-medium">روی کار کدام مشتری؟</span>
                  <Select name="clientId" defaultValue={open?.stretch.clientId ?? ""} key={open?.stretch.id ?? "closed"}>
                    <option value="">کار عمومی</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </label>
                {open ? (
                  <Button type="submit" variant="outline"><Repeat className="size-4" />تغییر مشتری</Button>
                ) : (
                  <Button type="submit"><LogIn className="size-4" />ثبت ورود</Button>
                )}
              </form>
              {open && (
                <form action={clockOut}>
                  <Button type="submit" variant="danger"><LogOut className="size-4" />ثبت خروج</Button>
                </form>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">ساعت‌هایی که روی هر مشتری ثبت می‌شود، در سودآوری همان مشتری حساب می‌شود.</p>
          </Card>

          {isAdmin && <TeamToday selected={typeof sp.user === "string" ? sp.user : null} now={now} clients={clients} />}

          <Card>
            <h2 className="mb-3 font-semibold">ساعت‌های من در {periodLabel(period)}</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">هنوز ساعتی ثبت نشده است.</p>
            ) : (
              <StretchList stretches={mine} clientName={clientName} now={now} />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {isAdmin && <PendingLeaves />}
          <Card>
            <h2 className="mb-4 font-semibold">درخواست مرخصی</h2>
            <LeaveForm action={requestLeave} />
            {leaves.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
                {leaves.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <span>
                      {LEAVE_KIND_LABELS[l.kind]} · {formatIsoDate(l.startsOn)}
                      {l.endsOn !== l.startsOn && ` تا ${formatIsoDate(l.endsOn)}`}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={REQUEST_STATUS_TONES[l.status]}>{REQUEST_STATUS_LABELS[l.status]}</Badge>
                      {l.status === "pending" && (
                        <form action={cancelLeave.bind(null, l.id)}>
                          <button type="submit" className="text-xs text-muted-foreground hover:text-danger">لغو</button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">فیش‌های حقوقی من</h2>
            {payslips.length === 0 ? (
              <p className="text-sm text-muted-foreground">هنوز فیشی پرداخت نشده است.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {payslips.map((p) => (
                  <li key={p.id}>
                    <Link href={`/payroll/${p.id}`} className="text-primary hover:underline">{periodLabel(p.period)}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {isAdmin && (
            <Card>
              <h2 className="mb-1 font-semibold">ثبت دستی ساعت</h2>
              <p className="mb-4 text-xs text-muted-foreground">برای وقتی که کسی ورود یا خروجش را فراموش کرده است.</p>
              <StretchForm action={addStretch} team={(await activeTeam()).map((m) => ({ id: m.id, name: m.name }))} clients={clients} today={isoDateToJalali(tehranDay(now))} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function StretchList({
  stretches,
  clientName,
  now,
  editable = false,
}: {
  stretches: (typeof schema.attendance.$inferSelect)[];
  clientName: Map<string, string>;
  now: Date;
  editable?: boolean;
}) {
  return (
    <ul className="divide-y divide-border text-sm">
      {[...stretches].reverse().map((s) => (
        <li key={s.id} className="py-2">
          <div className="flex items-center justify-between gap-2">
            <span>
              {formatJalaliDate(s.clockIn)} · <span className="ltr">{formatTime(s.clockIn)} – {s.clockOut ? formatTime(s.clockOut) : "…"}</span>
              <span className="text-muted-foreground"> · {s.clientId ? clientName.get(s.clientId) ?? "مشتری" : "کار عمومی"}</span>
              {s.editedBy && <Badge className="mr-2">ثبت دستی</Badge>}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-medium">{formatMinutes(minutesWithin([s], s.clockIn, new Date(8.64e15), now))}</span>
              {editable && (
                <form action={deleteStretch.bind(null, s.id)}>
                  <button type="submit" title="حذف" className="rounded p-1 text-muted-foreground hover:text-danger"><Trash2 className="size-3.5" /></button>
                </form>
              )}
            </span>
          </div>
          {editable && !s.clockOut && now.getTime() - s.clockIn.getTime() > 14 * 3600 * 1000 && (
            <CloseStretchForm id={s.id} action={closeStretch.bind(null, s.id)} day={jalaliInputValue(s.clockIn).date} />
          )}
        </li>
      ))}
    </ul>
  );
}

async function TeamToday({ selected, now, clients }: { selected: string | null; now: Date; clients: { id: string; name: string }[] }) {
  const period = periodOf(now);
  const { start, end } = periodRange(period);
  const todayStart = new Date(`${tehranDay(now)}T00:00:00+03:30`);
  const [team, stretches, leaveToday] = await Promise.all([activeTeam(), stretchesBetween(start, end), onLeaveToday()]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const chosen = team.find((m) => m.id === selected);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">تیم امروز</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-right font-medium">نفر</th>
              <th className="py-2 text-right font-medium">وضعیت</th>
              <th className="py-2 text-right font-medium">امروز</th>
              <th className="py-2 text-right font-medium">این ماه</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => {
              const mine = stretches.filter((s) => s.userId === m.id);
              const open = mine.find((s) => !s.clockOut);
              const month = minutesWithin(mine, start, end, now);
              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-2">
                    <Link href={`/attendance?user=${m.id}`} scroll={false} className="hover:text-primary">{m.name}</Link>
                  </td>
                  <td className="py-2">
                    {open ? (
                      <Badge tone="success">از {formatTime(open.clockIn)}{open.clientId ? ` · ${clientName.get(open.clientId) ?? ""}` : ""}</Badge>
                    ) : leaveToday.includes(m.id) ? (
                      <Badge tone="warning">مرخصی</Badge>
                    ) : (
                      <Badge>نیامده</Badge>
                    )}
                  </td>
                  <td className="py-2">{formatMinutes(minutesWithin(mine, todayStart, end, now))}</td>
                  <td className="py-2">
                    {formatMinutes(month)}
                    {m.payType === "monthly" && <span className="text-xs text-muted-foreground"> از {toPersianDigits(STANDARD_MONTH_MINUTES / 60)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {chosen && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-semibold">ساعت‌های {chosen.name} در این ماه</h3>
          <StretchList stretches={stretches.filter((s) => s.userId === chosen.id)} clientName={clientName} now={now} editable />
        </div>
      )}
    </Card>
  );
}

async function PendingLeaves() {
  const leaves = await pendingLeaves();
  if (leaves.length === 0) return null;
  return (
    <Card className="border-warning/40">
      <h2 className="mb-3 font-semibold">درخواست‌های مرخصی</h2>
      <ul className="space-y-3 text-sm">
        {leaves.map(({ leave: l, name }) => (
          <li key={l.id} className="rounded-lg bg-muted/50 p-3">
            <p className="font-medium">{name} · {LEAVE_KIND_LABELS[l.kind]}</p>
            <p className="text-xs text-muted-foreground">
              {formatIsoDate(l.startsOn)}{l.endsOn !== l.startsOn && ` تا ${formatIsoDate(l.endsOn)}`}
              {l.reason && ` · ${l.reason}`}
            </p>
            <div className="mt-2 flex gap-2">
              <form action={decideLeave.bind(null, l.id, true)}>
                <Button type="submit" className="h-8 px-3 text-xs">تأیید</Button>
              </form>
              <form action={decideLeave.bind(null, l.id, false)}>
                <Button type="submit" variant="outline" className="h-8 px-3 text-xs">رد</Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
