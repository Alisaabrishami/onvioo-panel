import { asc, desc, eq } from "drizzle-orm";
import { ExternalLink, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { formatIsoDate } from "@/lib/format";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_TONES, SERVICE_KIND_LABELS, progressOf } from "@/lib/services";
import { ProgressBar } from "@/components/progress-bar";

export const metadata: Metadata = { title: "پروژه‌های سایت" };

export default async function ProjectsPage() {
  await requireTeam();
  const [projects, milestones] = await Promise.all([
    db
      .select({ project: schema.projects, clientName: schema.clients.name })
      .from(schema.projects)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
      .orderBy(asc(schema.projects.status), desc(schema.projects.updatedAt)),
    db.select({ projectId: schema.milestones.projectId, done: schema.milestones.done }).from(schema.milestones),
  ]);

  return (
    <>
      <PageHeader
        title="پروژه‌های سایت"
        description="طراحی سایت، فرانت‌اند، بک‌اند، سئو و پشتیبانی"
        actions={
          <Link href="/projects/new" className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow transition-[filter,transform] hover:brightness-105 active:scale-[0.97]">
            <Plus className="size-4" />
            پروژه جدید
          </Link>
        }
      />
      {projects.length === 0 ? (
        <EmptyState>هنوز پروژه سایتی ثبت نشده است.</EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {projects.map(({ project: p, clientName }) => (
            <li key={p.id} className="glass rounded-3xl p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">{p.title}</Link>
                <Badge tone={PROJECT_STATUS_TONES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                {clientName} · {SERVICE_KIND_LABELS[p.kind]}
                {p.dueOn && ` · تحویل ${formatIsoDate(p.dueOn)}`}
              </p>
              <ProgressBar value={progressOf(milestones.filter((m) => m.projectId === p.id))} />
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer" className="ltr mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  {p.url.replace(/^https?:\/\//, "")}
                  <ExternalLink className="size-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
