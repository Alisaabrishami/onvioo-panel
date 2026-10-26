import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { followedTaskDone } from "./follow-up-run";
import { openStretch } from "./team-data";

// Everyday team actions shared by the Bale/Telegram bot and the mobile API

// Midnight at the end of today, Tehran time (Iran has no daylight saving)
export function endOfTehranDay(now: Date): Date {
  const offset = 3.5 * 3600_000;
  const local = now.getTime() + offset;
  return new Date(Math.floor(local / 86400_000) * 86400_000 + 86400_000 - offset);
}

function revalidateAttendance() {
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

// Only the assignee closes a task this way; returns null when it was not open
export async function completeTask(userId: string, taskId: string, via: string): Promise<{ title: string } | null> {
  const [task] = await db
    .update(schema.tasks)
    .set({ status: "done", completedAt: new Date() })
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.assigneeId, userId), ne(schema.tasks.status, "done")))
    .returning({ title: schema.tasks.title });
  if (!task) return null;
  await audit(userId, "status", "task", taskId, { status: "done", via });
  await followedTaskDone(taskId, userId, via);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return task;
}

// Starts a stretch of work, closing the open one first so hours land on the right client
export async function clockIn(userId: string, clientId: string | null): Promise<{ at: Date; switched: boolean; clientName: string | null }> {
  const at = new Date();
  const switched = await db.transaction(async (tx) => {
    const closed = await tx
      .update(schema.attendance)
      .set({ clockOut: at })
      .where(and(eq(schema.attendance.userId, userId), isNull(schema.attendance.clockOut)))
      .returning({ id: schema.attendance.id });
    await tx.insert(schema.attendance).values({ userId, clientId, clockIn: at });
    return closed.length > 0;
  });
  revalidateAttendance();
  const [client] = clientId ? await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, clientId)) : [];
  return { at, switched, clientName: client?.name ?? null };
}

export async function clockOut(userId: string): Promise<{ at: Date; todayMinutes: number } | null> {
  const at = new Date();
  const closed = await db
    .update(schema.attendance)
    .set({ clockOut: at })
    .where(and(eq(schema.attendance.userId, userId), isNull(schema.attendance.clockOut)))
    .returning({ id: schema.attendance.id });
  if (closed.length === 0) return null;
  revalidateAttendance();
  return { at, todayMinutes: await todayMinutes(userId, at) };
}

// Minutes worked since Tehran midnight, the open stretch counted up to now
export async function todayMinutes(userId: string, now: Date = new Date()): Promise<number> {
  const dayStart = new Date(endOfTehranDay(now).getTime() - 86400_000);
  const rows = await db
    .select({ clockIn: schema.attendance.clockIn, clockOut: schema.attendance.clockOut })
    .from(schema.attendance)
    .where(and(eq(schema.attendance.userId, userId), or(gte(schema.attendance.clockIn, dayStart), isNull(schema.attendance.clockOut), gte(schema.attendance.clockOut, dayStart))));
  const ms = rows.reduce((sum, s) => sum + Math.max(0, (s.clockOut ?? now).getTime() - Math.max(s.clockIn.getTime(), dayStart.getTime())), 0);
  return Math.round(ms / 60_000);
}

// Today's work for one person: overdue and due-today tasks, shoots, content deadlines
export async function todayPlan(userId: string, now: Date = new Date()) {
  const end = endOfTehranDay(now);
  const start = new Date(end.getTime() - 86400_000);
  const [tasks, shoots, contents, stretch] = await Promise.all([
    db
      .select({ id: schema.tasks.id, title: schema.tasks.title, dueAt: schema.tasks.dueAt })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.assigneeId, userId), ne(schema.tasks.status, "done"), isNotNull(schema.tasks.dueAt), lt(schema.tasks.dueAt, end)))
      .orderBy(asc(schema.tasks.dueAt))
      .limit(15),
    db
      .select({ id: schema.shoots.id, title: schema.shoots.title, startsAt: schema.shoots.startsAt, location: schema.shoots.location, clientName: schema.clients.name })
      .from(schema.shoots)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.shoots.clientId))
      .where(and(eq(schema.shoots.crewId, userId), gte(schema.shoots.startsAt, start), lt(schema.shoots.startsAt, end)))
      .orderBy(asc(schema.shoots.startsAt)),
    db
      .select({ id: schema.contents.id, title: schema.contents.title, stage: schema.contents.stage, dueAt: schema.contents.dueAt })
      .from(schema.contents)
      .where(
        and(
          eq(schema.contents.assigneeId, userId),
          inArray(schema.contents.stage, ["idea", "shot", "editing", "internal_review"]),
          isNotNull(schema.contents.dueAt),
          lt(schema.contents.dueAt, end),
        ),
      )
      .orderBy(asc(schema.contents.dueAt))
      .limit(10),
    openStretch(userId),
  ]);
  return { dayStart: start, tasks, shoots, contents, stretch };
}
