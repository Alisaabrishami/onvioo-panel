import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/content";
import { notifyUsers } from "@/lib/notify";
import { TEAM, authed, body, page, query, uuid } from "@/lib/api/http";

const assignee = alias(schema.users, "assignee");

// ?scope=mine (default) or all; ?status=open (default), done or all
export const GET = authed(async (user, request) => {
  const q = query(request);
  const { limit, offset } = page(request);
  const status = q.get("status") ?? "open";
  const items = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      description: schema.tasks.description,
      status: schema.tasks.status,
      priority: schema.tasks.priority,
      dueAt: schema.tasks.dueAt,
      clientId: schema.tasks.clientId,
      clientName: schema.clients.name,
      contentId: schema.tasks.contentId,
      assigneeId: schema.tasks.assigneeId,
      assigneeName: assignee.name,
      completedAt: schema.tasks.completedAt,
      createdAt: schema.tasks.createdAt,
    })
    .from(schema.tasks)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.tasks.clientId))
    .leftJoin(assignee, eq(assignee.id, schema.tasks.assigneeId))
    .where(
      and(
        q.get("scope") === "all" ? undefined : eq(schema.tasks.assigneeId, user.id),
        status === "open" ? ne(schema.tasks.status, "done") : status === "done" ? eq(schema.tasks.status, "done") : undefined,
      ),
    )
    .orderBy(status === "done" ? desc(schema.tasks.completedAt) : sql`${schema.tasks.dueAt} asc nulls last`, asc(schema.tasks.createdAt))
    .limit(limit)
    .offset(offset);
  return { items: items.map((t) => ({ ...t, statusLabel: TASK_STATUS_LABELS[t.status], priorityLabel: PRIORITY_LABELS[t.priority] })) };
}, TEAM);

const createSchema = z.object({
  title: z.string().trim().min(2, { error: "عنوان کار را بنویسید" }).max(200),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(schema.taskPriorityEnum.enumValues).default("normal"),
  assigneeId: uuid.optional(),
  clientId: uuid.optional(),
  dueAt: z.iso.datetime({ offset: true, error: "زمان را به‌صورت ISO 8601 بفرستید" }).optional(),
});

export const POST = authed(async (user, request) => {
  const input = await body(request, createSchema);
  const [task] = await db
    .insert(schema.tasks)
    .values({ ...input, dueAt: input.dueAt ? new Date(input.dueAt) : null, assigneeId: input.assigneeId ?? user.id, createdBy: user.id })
    .returning();
  await audit(user.id, "create", "task", task.id, { title: task.title, via: "api" });
  await notifyUsers([task.assigneeId], { title: `کار جدید: ${task.title}`, href: "/tasks" }, user.id);
  return Response.json({ data: task }, { status: 201 });
}, TEAM);
