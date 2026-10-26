import { asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { clientOptions, isUuid, teamOptions } from "@/lib/data";
import { formatJalaliDate, isoDateToJalali, toPersianDigits } from "@/lib/format";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_TONES, SERVICE_KIND_LABELS, TICKET_STATUS_LABELS, TICKET_STATUS_TONES, progressOf } from "@/lib/services";
import { addMilestone, updateProject } from "../actions";
import { AddMilestone } from "../add-milestone";
import { Milestones } from "../milestones";
import { ProgressBar } from "@/components/progress-bar";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "پروژه" };

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  await requireTeam();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ project: schema.projects, clientName: schema.clients.name })
    .from(schema.projects)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.projects.clientId))
    .where(eq(schema.projects.id, id));
  if (!row) notFound();
  const p = row.project;

  const [milestones, tickets, clients, team] = await Promise.all([
    db.select().from(schema.milestones).where(eq(schema.milestones.projectId, id)).orderBy(asc(schema.milestones.position)),
    db
      .select({ id: schema.tickets.id, number: schema.tickets.number, title: schema.tickets.title, status: schema.tickets.status, updatedAt: schema.tickets.updatedAt })
      .from(schema.tickets)
      .where(eq(schema.tickets.projectId, id))
      .orderBy(desc(schema.tickets.updatedAt)),
    clientOptions(),
    teamOptions(),
  ]);

  return (
    <>
      <PageHeader
        title={p.title}
        description={`${row.clientName} · ${SERVICE_KIND_LABELS[p.kind]}`}
        actions={<Badge tone={PROJECT_STATUS_TONES[p.status]}>{PROJECT_STATUS_LABELS[p.status]}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <h2 className="mb-4 font-semibold">جزئیات پروژه</h2>
          <ProjectForm
            action={updateProject.bind(null, p.id)}
            clients={clients}
            team={team}
            initial={{
              clientId: p.clientId,
              title: p.title,
              kind: p.kind,
              status: p.status,
              url: p.url ?? "",
              ownerId: p.ownerId ?? "",
              startsOn: isoDateToJalali(p.startsOn),
              dueOn: isoDateToJalali(p.dueOn),
              notes: p.notes ?? "",
            }}
            submitLabel="ذخیره تغییرات"
          />
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 font-semibold">مراحل</h2>
            <div className="mb-3">
              <ProgressBar value={progressOf(milestones)} />
            </div>
            <Milestones items={milestones.map((m) => ({ id: m.id, title: m.title, done: m.done }))} />
            <AddMilestone action={addMilestone.bind(null, p.id)} />
            <p className="mt-3 text-xs text-muted-foreground">مشتری مراحل و پیشرفت را در پرتال می‌بیند.</p>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">تیکت‌های این پروژه</h2>
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">تیکتی ثبت نشده است.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/tickets/${t.id}`} className="hover:text-primary">
                      #{toPersianDigits(t.number ?? 0)} {t.title}
                      <span className="block text-xs text-muted-foreground">{formatJalaliDate(t.updatedAt)}</span>
                    </Link>
                    <Badge tone={TICKET_STATUS_TONES[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
