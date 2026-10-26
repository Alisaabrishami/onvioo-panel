import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader, StatusDot } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { formatIsoDate, formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_TONES, SERVICE_KIND_LABELS, progressOf } from "@/lib/services";
import { ProgressBar } from "@/components/progress-bar";

export const metadata: Metadata = { title: "سایت" };

export default async function PortalProjectsPage() {
  const user = await requireClient();
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.clientId, user.clientId))
    .orderBy(desc(schema.projects.updatedAt));
  const milestones = projects.length
    ? await db
        .select()
        .from(schema.milestones)
        .where(inArray(schema.milestones.projectId, projects.map((p) => p.id)))
        .orderBy(asc(schema.milestones.position))
    : [];
  const monitors = await db
    .select()
    .from(schema.monitors)
    .where(and(eq(schema.monitors.clientId, user.clientId), eq(schema.monitors.active, true)));
  const uptime = monitors.length
    ? await db
        .select({ id: schema.monitorChecks.monitorId, total: sql<number>`count(*)::int`, ok: sql<number>`count(*) filter (where ${schema.monitorChecks.ok})::int` })
        .from(schema.monitorChecks)
        .where(and(inArray(schema.monitorChecks.monitorId, monitors.map((m) => m.id)), sql`${schema.monitorChecks.at} >= now() - interval '30 days'`))
        .groupBy(schema.monitorChecks.monitorId)
    : [];

  return (
    <>
      <PageHeader title="سایت و خدمات وب" description="پیشرفت پروژه‌های سایت، سئو و پشتیبانی" />
      {monitors.length > 0 && (
        <Card className="mb-4 space-y-3">
          <h2 className="font-semibold">وضعیت سایت</h2>
          {monitors.map((m) => {
            const u = uptime.find((x) => x.id === m.id);
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <StatusDot live={m.up !== false} className={m.up === false ? "text-danger" : "text-success"} />
                  <span dir="ltr">{new URL(m.url).hostname}</span>
                  <span className="text-muted-foreground">{m.up === false ? "در حال بررسی توسط تیم" : "در دسترس"}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {u?.total ? `در دسترس ${toPersianDigits((Math.floor((u.ok / u.total) * 1000) / 10).toString())}٪ در ۳۰ روز` : ""}
                  {m.lastCheckedAt && ` · آخرین بررسی ${formatJalaliDateTime(m.lastCheckedAt)}`}
                </span>
              </div>
            );
          })}
        </Card>
      )}
      {projects.length === 0 ? (
        <EmptyState>پروژه سایتی برای شما ثبت نشده است.</EmptyState>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => {
            const steps = milestones.filter((m) => m.projectId === p.id);
            return (
              <Card key={p.id}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p.title}</h2>
                  <Badge tone={PROJECT_STATUS_TONES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {SERVICE_KIND_LABELS[p.kind]}
                  {p.dueOn && ` · موعد تحویل ${formatIsoDate(p.dueOn)}`}
                </p>
                <ProgressBar value={progressOf(steps)} />
                {steps.length > 0 && (
                  <ol className="mt-4 space-y-1.5 text-sm">
                    {steps.map((m) => (
                      <li key={m.id} className="flex items-center gap-2">
                        {m.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
                        <span className={m.done ? "text-muted-foreground" : ""}>{m.title}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="ltr mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    {p.url.replace(/^https?:\/\//, "")}
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
