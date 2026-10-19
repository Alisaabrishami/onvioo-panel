import { asc, desc, eq, inArray } from "drizzle-orm";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { formatIsoDate } from "@/lib/format";
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

  return (
    <>
      <PageHeader title="سایت و خدمات وب" description="پیشرفت پروژه‌های سایت، سئو و پشتیبانی" />
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
