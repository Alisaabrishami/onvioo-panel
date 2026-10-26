import { and, asc, eq, gte, sql } from "drizzle-orm";
import { ExternalLink, Pause, Play, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, EmptyState, PageHeader, StatusDot } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { clientOptions } from "@/lib/data";
import { formatIsoDate, formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import { daysUntil } from "@/lib/monitor";
import { cn } from "@/lib/utils";
import { checkNow, createMonitor, deleteMonitor, toggleMonitor } from "./actions";
import { MonitorForm } from "./monitor-form";

export const metadata: Metadata = { title: "پایش سایت‌ها" };

const pct = (v: number | null) => (v == null ? "—" : `${toPersianDigits((Math.floor(v * 1000) / 10).toString())}٪`);

export default async function MonitoringPage() {
  const user = await requireTeam();
  const now = new Date();
  const day = new Date(now.getTime() - 86400_000);
  const month = new Date(now.getTime() - 30 * 86400_000);
  const [monitors, monthStats, dayChecks, clients, projects] = await Promise.all([
    db
      .select({ monitor: schema.monitors, clientName: schema.clients.name })
      .from(schema.monitors)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.monitors.clientId))
      .orderBy(asc(schema.clients.name)),
    db
      .select({ id: schema.monitorChecks.monitorId, total: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${schema.monitorChecks.ok})::int` })
      .from(schema.monitorChecks)
      .where(gte(schema.monitorChecks.at, month))
      .groupBy(schema.monitorChecks.monitorId),
    db
      .select({ monitorId: schema.monitorChecks.monitorId, ok: schema.monitorChecks.ok, ms: schema.monitorChecks.ms, at: schema.monitorChecks.at, error: schema.monitorChecks.error })
      .from(schema.monitorChecks)
      .where(and(gte(schema.monitorChecks.at, day)))
      .orderBy(asc(schema.monitorChecks.at)),
    clientOptions(),
    db.select({ id: schema.projects.id, clientId: schema.projects.clientId, title: schema.projects.title, url: schema.projects.url }).from(schema.projects),
  ]);
  const isAdmin = user.role === "admin";
  const down = monitors.filter((m) => m.monitor.active && m.monitor.up === false);

  return (
    <>
      <PageHeader
        title="پایش سایت‌ها"
        description="هر ۵ دقیقه سایت مشتری‌ها بررسی می‌شود؛ قطعی و انقضای SSL به تیم اطلاع داده می‌شود"
        actions={monitors.length > 0 && <ActionButton action={checkNow.bind(null, undefined)} pendingLabel="در حال بررسی…">بررسی همه همین حالا</ActionButton>}
      />
      {down.length > 0 && (
        <Card className="mb-6 border-coral/50 bg-coral/15 text-sm">
          {toPersianDigits(down.length)} سایت الان در دسترس نیست: {down.map((d) => new URL(d.monitor.url).hostname).join("، ")}
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] [&>*]:min-w-0">
        {monitors.length === 0 ? (
          <EmptyState>هنوز سایتی برای پایش اضافه نشده است.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {monitors.map(({ monitor: m, clientName }) => {
              const checks = dayChecks.filter((c) => c.monitorId === m.id);
              const ms = checks.filter((c) => c.ok && c.ms != null).map((c) => c.ms!);
              const avg = ms.length ? Math.round(ms.reduce((s, v) => s + v, 0) / ms.length) : null;
              const ms30 = monthStats.find((s) => s.id === m.id);
              const up24 = checks.length ? checks.filter((c) => c.ok).length / checks.length : null;
              const up30 = ms30?.total ? ms30.ok / ms30.total : null;
              const ssl = daysUntil(m.sslExpiresAt, now);
              const domain = m.domainExpiresOn ? daysUntil(new Date(`${m.domainExpiresOn}T00:00:00+03:30`), now) : null;
              const last = checks.at(-1);
              const bars = checks.slice(-48);
              const state = !m.active ? "paused" : m.up === false ? "down" : m.up ? "up" : "unknown";
              return (
                <li key={m.id}>
                  <Card className={cn("space-y-3", state === "down" && "border-coral/60")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <StatusDot live={state === "up"} className={state === "up" ? "text-success" : state === "down" ? "text-danger" : "text-muted-foreground"} />
                        <div>
                          <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:text-primary" dir="ltr">
                            {new URL(m.url).hostname}<ExternalLink className="size-3.5" />
                          </a>
                          <p className="text-xs text-muted-foreground">{clientName}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {state === "down" && <Badge tone="danger">قطع{m.downSince && ` از ${formatJalaliDateTime(m.downSince)}`}</Badge>}
                        {state === "paused" && <Badge>متوقف</Badge>}
                        {ssl != null && <Badge tone={ssl <= 14 ? "danger" : ssl <= 30 ? "warning" : "neutral"}>SSL: {ssl <= 0 ? "منقضی" : `${toPersianDigits(ssl)} روز`}</Badge>}
                        {domain != null && <Badge tone={domain <= 7 ? "danger" : domain <= 30 ? "warning" : "neutral"}>دامنه: {formatIsoDate(m.domainExpiresOn)}</Badge>}
                      </div>
                    </div>
                    <div className="flex h-8 items-end gap-0.5" dir="ltr" aria-label="۴۸ بررسی آخر">
                      {bars.length === 0 ? (
                        <p className="text-xs text-muted-foreground" dir="rtl">هنوز بررسی‌ای ثبت نشده</p>
                      ) : (
                        bars.map((c, i) => (
                          <span
                            key={i}
                            title={`${formatJalaliDateTime(c.at)} · ${c.ok ? `${c.ms}ms` : c.error}`}
                            className={cn("w-1.5 rounded-sm", c.ok ? "bg-mint" : "bg-coral")}
                            style={{ height: c.ok ? `${Math.max(25, Math.min(100, ((c.ms ?? 0) / 3000) * 100))}%` : "100%" }}
                          />
                        ))
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div><dt className="text-muted-foreground">در دسترس ۲۴ ساعت</dt><dd className="font-semibold">{pct(up24)}</dd></div>
                      <div><dt className="text-muted-foreground">در دسترس ۳۰ روز</dt><dd className="font-semibold">{pct(up30)}</dd></div>
                      <div><dt className="text-muted-foreground">میانگین سرعت</dt><dd className="font-semibold">{avg == null ? "—" : `${toPersianDigits(avg)} میلی‌ثانیه`}</dd></div>
                      <div><dt className="text-muted-foreground">آخرین بررسی</dt><dd className="font-semibold">{m.lastCheckedAt ? formatJalaliDateTime(m.lastCheckedAt) : "—"}</dd></div>
                    </dl>
                    {last && !last.ok && <p className="text-xs text-danger">آخرین خطا: {last.error}</p>}
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <ActionButton action={checkNow.bind(null, m.id)} pendingLabel="…" variant="ghost" className="h-8 px-3 text-xs">بررسی</ActionButton>
                      {isAdmin && (
                        <>
                          <form action={toggleMonitor.bind(null, m.id, !m.active)}>
                            <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground hover:bg-muted">
                              {m.active ? <><Pause className="size-3.5" />توقف</> : <><Play className="size-3.5" />ادامه</>}
                            </button>
                          </form>
                          <form action={deleteMonitor.bind(null, m.id)}>
                            <button type="submit" className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground hover:text-danger" aria-label="حذف"><Trash2 className="size-3.5" /></button>
                          </form>
                        </>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        {isAdmin && (
          <Card className="h-fit">
            <h2 className="mb-4 font-semibold">سایت تازه</h2>
            <MonitorForm action={createMonitor} clients={clients} projects={projects} />
          </Card>
        )}
      </div>
    </>
  );
}
