import { and, asc, desc, eq, gte, ne, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Metadata } from "next";
import { Bot } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { isOverdue } from "@/lib/content";
import { clientOptions, teamOptions } from "@/lib/data";
import { toPersianDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskForm } from "./task-form";
import { TaskRow } from "./task-row";

export const metadata: Metadata = { title: "کارها" };

const VIEWS = { mine: "کارهای من", all: "همه کارها", done: "انجام‌شده‌ها" } as const;
type View = keyof typeof VIEWS;

export default async function TasksPage(props: PageProps<"/tasks">) {
  const user = await requireTeam();
  const sp = await props.searchParams;
  const view: View = sp.view === "all" || sp.view === "done" ? sp.view : "mine";

  const now = new Date();
  const filters: SQL[] = [];
  if (view === "mine") filters.push(eq(schema.tasks.assigneeId, user.id));
  if (view === "done") {
    filters.push(eq(schema.tasks.status, "done"), gte(schema.tasks.completedAt, new Date(now.getTime() - 30 * 24 * 3600 * 1000)));
  } else {
    filters.push(ne(schema.tasks.status, "done"));
  }

  const assignee = alias(schema.users, "assignee");
  const manager = alias(schema.users, "manager");
  const [rows, team, clients] = await Promise.all([
    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        status: schema.tasks.status,
        priority: schema.tasks.priority,
        dueAt: schema.tasks.dueAt,
        autoKey: schema.tasks.autoKey,
        contentId: schema.tasks.contentId,
        createdBy: schema.tasks.createdBy,
        assigneeId: schema.tasks.assigneeId,
        followUpBy: schema.tasks.followUpBy,
        checkin: schema.tasks.checkin,
        checkinNote: schema.tasks.checkinNote,
        clientName: schema.clients.name,
        assigneeName: assignee.name,
        managerName: manager.name,
      })
      .from(schema.tasks)
      .leftJoin(schema.clients, eq(schema.clients.id, schema.tasks.clientId))
      .leftJoin(assignee, eq(assignee.id, schema.tasks.assigneeId))
      .leftJoin(manager, eq(manager.id, schema.tasks.followUpBy))
      .where(and(...filters))
      .orderBy(
        ...(view === "done"
          ? [desc(schema.tasks.completedAt)]
          : [
              sql`case ${schema.tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
              asc(sql`coalesce(${schema.tasks.dueAt}, 'infinity')`),
              desc(schema.tasks.createdAt),
            ]),
      )
      .limit(300),
    teamOptions(),
    clientOptions(),
  ]);

  const items = rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt,
    auto: t.autoKey !== null,
    contentId: t.contentId,
    clientName: t.clientName,
    assigneeName: view === "mine" ? null : t.assigneeName,
    late: t.status !== "done" && isOverdue(t.dueAt, now),
    canDelete: user.role === "admin" || (t.autoKey === null && t.createdBy === user.id),
    followUp: t.followUpBy ? { manager: t.managerName, checkin: t.checkin, note: t.checkinNote } : null,
    mine: t.assigneeId === user.id,
    canFollowUp: user.role === "admin",
    hasAssignee: t.assigneeId !== null,
  }));
  const late = items.filter((t) => t.late).length;

  return (
    <>
      <PageHeader
        title="کارها"
        description={
          view !== "done" && late > 0
            ? `${toPersianDigits(late)} کار از مهلتش گذشته است`
            : "کارهای تیم؛ کارهای تدوین و بازبینی از بورد محتوا خودکار ساخته می‌شوند"
        }
      />
      <Card className="mb-6">
        <TaskForm team={team} clients={clients} me={user.id} canFollowUp={user.role === "admin"} />
      </Card>
      <div className="mb-3 flex gap-1 text-sm">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={v === "mine" ? "/tasks" : `/tasks?view=${v}`}
            className={cn("rounded-full px-3.5 py-1.5", v === view ? "bg-primary font-medium text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-muted")}
          >
            {VIEWS[v]}
          </Link>
        ))}
        {user.role === "admin" && (
          <Link href="/tasks/follow-up" className="ms-auto flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-primary hover:bg-muted">
            <Bot className="size-4" />
            پیگیری‌های دستیار
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState>{view === "done" ? "در ۳۰ روز گذشته کاری تمام نشده است." : "کار بازی نمانده است 🎉"}</EmptyState>
      ) : (
        <Card className="py-1">
          <ul className="divide-y divide-border">
            {items.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
