import { and, count, desc, eq, gte, ne, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { isOverdue } from "@/lib/content";
import { clientOptions, isUuid, teamOptions } from "@/lib/data";
import { Board } from "./board";

export const metadata: Metadata = { title: "محتوا" };

export default async function ContentPage(props: PageProps<"/content">) {
  const user = await requireTeam();
  const sp = await props.searchParams;
  const clientId = isUuid(sp.client) ? sp.client : null;
  const assignee = sp.assignee === "me" ? user.id : isUuid(sp.assignee) ? sp.assignee : null;

  // Published items leave the board two weeks after they go out
  const now = new Date();
  const recent = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const filters: SQL[] = [
    or(ne(schema.contents.stage, "published"), gte(schema.contents.updatedAt, recent))!,
  ];
  if (clientId) filters.push(eq(schema.contents.clientId, clientId));
  if (assignee) filters.push(eq(schema.contents.assigneeId, assignee));

  const assigneeUser = alias(schema.users, "assignee");
  const [rows, clients, team] = await Promise.all([
    db
      .select({
        id: schema.contents.id,
        title: schema.contents.title,
        type: schema.contents.type,
        stage: schema.contents.stage,
        dueAt: schema.contents.dueAt,
        publishAt: schema.contents.publishAt,
        clientName: schema.clients.name,
        assigneeName: assigneeUser.name,
        comments: count(schema.contentComments.id),
      })
      .from(schema.contents)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.contents.clientId))
      .leftJoin(assigneeUser, eq(assigneeUser.id, schema.contents.assigneeId))
      .leftJoin(schema.contentComments, eq(schema.contentComments.contentId, schema.contents.id))
      .where(and(...filters))
      .groupBy(schema.contents.id, schema.clients.name, assigneeUser.name)
      .orderBy(desc(schema.contents.updatedAt)),
    clientOptions(),
    teamOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="محتوا"
        description="مسیر هر ریلز و استوری از ایده تا انتشار؛ کارت‌ها را بین ستون‌ها بکشید"
        actions={
          <Link
            href="/content/new"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow transition-[filter,transform] hover:brightness-105 active:scale-[0.97]"
          >
            <Plus className="size-4" />
            محتوای جدید
          </Link>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <select name="client" defaultValue={clientId ?? ""} className="h-9 rounded-full border border-border bg-muted px-3 [&>option]:bg-surface-solid" aria-label="مشتری">
          <option value="">همه مشتری‌ها</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="assignee" defaultValue={sp.assignee === "me" ? "me" : (assignee ?? "")} className="h-9 rounded-full border border-border bg-muted px-3 [&>option]:bg-surface-solid" aria-label="مسئول">
          <option value="">همه اعضای تیم</option>
          <option value="me">فقط کارهای من</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-full border border-border px-3.5 hover:bg-muted">اعمال فیلتر</button>
        {(clientId || assignee) && (
          <Link href="/content" className="flex h-9 items-center px-2 text-muted-foreground hover:text-primary">حذف فیلتر</Link>
        )}
      </form>
      {rows.length === 0 && !clientId && !assignee ? (
        <EmptyState>هنوز محتوایی ثبت نشده است. با «محتوای جدید» اولین ایده را اضافه کنید.</EmptyState>
      ) : (
        <Board items={rows.map((r) => ({ ...r, late: isOverdue(r.dueAt, now) }))} />
      )}
    </>
  );
}
