import "server-only";
import { and, eq, gte, inArray, isNotNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { callClaude } from "./ai";
import { audit } from "./audit";
import type { InlineButton } from "./bot";
import { shorten } from "./bot-text";
import { toPersianDigits } from "./format";
import {
  ANSWER_EMOJI,
  ESCALATE_AFTER,
  type AskReason,
  askReason,
  digestEmpty,
  digestText,
  groupForDigest,
  inWorkingHours,
  questionText,
} from "./follow-up";
import { notifyUsers } from "./notify";
import { onLeaveToday } from "./team-data";

export type CheckinAnswer = "done" | "on_track" | "blocked";

const assignee = alias(schema.users, "assignee");
const manager = alias(schema.users, "manager");

function revalidateTasks() {
  revalidatePath("/tasks");
  revalidatePath("/tasks/follow-up");
  revalidatePath("/dashboard");
}

// Called every few minutes: asks each assignee, in one message, about the
// followed tasks that are due a question
export async function runFollowUps(now: Date = new Date()): Promise<number> {
  if (!inWorkingHours(now)) return 0;
  const rows = await db
    .select({
      task: schema.tasks,
      assigneeName: assignee.name,
      managerName: manager.name,
    })
    .from(schema.tasks)
    .innerJoin(assignee, eq(assignee.id, schema.tasks.assigneeId))
    .innerJoin(manager, eq(manager.id, schema.tasks.followUpBy))
    .where(and(isNotNull(schema.tasks.followUpBy), ne(schema.tasks.status, "done"), eq(assignee.active, true), ne(assignee.role, "client")));
  const onLeave = new Set(await onLeaveToday());

  const byAssignee = new Map<string, { task: typeof schema.tasks.$inferSelect; reason: AskReason; assigneeName: string; managerName: string }[]>();
  for (const r of rows) {
    const reason = askReason(r.task, now);
    if (!reason || onLeave.has(r.task.assigneeId!)) continue;
    byAssignee.set(r.task.assigneeId!, [...(byAssignee.get(r.task.assigneeId!) ?? []), { ...r, reason }]);
  }

  for (const [userId, items] of byAssignee) {
    const managers = [...new Set(items.map((i) => i.managerName))];
    const asked = items.slice(0, 8);
    const n = (i: number) => toPersianDigits(i + 1);
    await notifyUsers([userId], {
      title: `دستیار: وضعیت ${asked.length > 1 ? `${toPersianDigits(asked.length)} کار` : `«${shorten(asked[0].task.title, 40)}»`} را بگویید`,
      body: questionText(managers.length === 1 ? managers[0] : "مدیر", asked.map((i) => ({ title: i.task.title, dueAt: i.task.dueAt, reason: i.reason }))),
      href: "/tasks",
      buttons: asked.map(({ task }, i): InlineButton[] => [
        { text: `${ANSWER_EMOJI.done} ${n(i)}`, data: `fd:${task.id}` },
        { text: `${ANSWER_EMOJI.on_track} ${n(i)}`, data: `fo:${task.id}` },
        { text: `${ANSWER_EMOJI.blocked} ${n(i)}`, data: `fb:${task.id}` },
      ]),
    });
    for (const { task, assigneeName } of asked) {
      await db
        .update(schema.tasks)
        .set({ askedAt: now, unanswered: task.unanswered + 1, checkin: task.checkin === "blocked" ? "blocked" : "asked" })
        .where(eq(schema.tasks.id, task.id));
      await db.insert(schema.taskUpdates).values({ taskId: task.id, kind: "asked", via: "assistant" });
      // Two questions went unanswered: tell the manager once
      if (task.unanswered === ESCALATE_AFTER) {
        await db.insert(schema.taskUpdates).values({ taskId: task.id, kind: "escalated", via: "assistant" });
        await notifyUsers([task.followUpBy], {
          title: `🔕 ${assigneeName} به ${toPersianDigits(ESCALATE_AFTER)} پیگیری درباره «${shorten(task.title, 40)}» جواب نداده`,
          body: "دوباره پرسیدم؛ شاید لازم باشد خودتان تماس بگیرید.",
          href: "/tasks/follow-up",
        });
      }
    }
  }
  if (byAssignee.size) revalidateTasks();
  return byAssignee.size;
}

// The assignee's answer, from the bot's buttons or the panel. Only the
// assignee can answer; returns the task's title, or null when it isn't theirs.
export async function answerCheckin(
  userId: string,
  taskId: string,
  answer: CheckinAnswer,
  opts: { note?: string | null; via: string; tellManager?: boolean },
): Promise<{ title: string } | null> {
  const now = new Date();
  const note = opts.note?.trim().slice(0, 500) || null;
  const [task] = await db
    .update(schema.tasks)
    .set(
      answer === "done"
        ? { status: "done", completedAt: now, checkin: null, answeredAt: now, unanswered: 0 }
        : { status: "doing", checkin: answer, checkinNote: note, answeredAt: now, unanswered: 0 },
    )
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.assigneeId, userId), ne(schema.tasks.status, "done")))
    .returning({ title: schema.tasks.title, followUpBy: schema.tasks.followUpBy });
  if (!task) return null;
  await db.insert(schema.taskUpdates).values({ taskId, userId, kind: answer, note, via: opts.via });
  await audit(userId, "checkin", "task", taskId, { answer, via: opts.via });
  revalidateTasks();

  if (answer !== "on_track" && opts.tellManager !== false && task.followUpBy) {
    const [me] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
    await notifyUsers(
      [task.followUpBy],
      answer === "done"
        ? { title: `✅ ${me.name} «${shorten(task.title, 40)}» را تمام کرد`, href: "/tasks/follow-up" }
        : { title: `🙋 ${me.name} در «${shorten(task.title, 40)}» گیر کرده`, body: note ?? undefined, href: "/tasks/follow-up" },
      userId,
    );
  }
  return task;
}

// When a followed task is closed some other way (the task list, the API), the manager still hears
export async function followedTaskDone(taskId: string, byUserId: string, via: string): Promise<void> {
  const [task] = await db
    .update(schema.tasks)
    .set({ checkin: null, unanswered: 0 })
    .where(and(eq(schema.tasks.id, taskId), isNotNull(schema.tasks.followUpBy)))
    .returning({ title: schema.tasks.title, followUpBy: schema.tasks.followUpBy });
  if (!task) return;
  await db.insert(schema.taskUpdates).values({ taskId, userId: byUserId, kind: "done", via });
  const [me] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, byUserId));
  await notifyUsers([task.followUpBy], { title: `✅ ${me?.name ?? "کسی"} «${shorten(task.title, 40)}» را تمام کرد`, href: "/tasks/follow-up" }, byUserId);
}

// The person who caused a follow-up starts it: the assignee hears right away,
// and questions begin the next working day
export async function startFollowUp(managerId: string, taskId: string, every: number): Promise<boolean> {
  const now = new Date();
  const [task] = await db
    .update(schema.tasks)
    .set({ followUpBy: managerId, followUpEvery: every, askedAt: now, unanswered: 0, checkin: null, checkinNote: null })
    .where(and(eq(schema.tasks.id, taskId), isNotNull(schema.tasks.assigneeId), ne(schema.tasks.status, "done")))
    .returning({ title: schema.tasks.title, assigneeId: schema.tasks.assigneeId });
  if (!task) return false;
  const [me] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, managerId));
  await notifyUsers(
    [task.assigneeId],
    { title: `📌 ${me.name} کار «${shorten(task.title, 40)}» را به شما سپرد`, body: "دستیار پنل از طرف ایشان پیگیر این کار است و هر از گاهی وضعیتش را از شما می‌پرسد.", href: "/tasks" },
    managerId,
  );
  revalidateTasks();
  return true;
}

export async function stopFollowUp(taskId: string): Promise<void> {
  await db.update(schema.tasks).set({ followUpBy: null, checkin: null, unanswered: 0 }).where(eq(schema.tasks.id, taskId));
  revalidateTasks();
}

export async function followedTasks(managerId: string | null, since: Date) {
  return db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      status: schema.tasks.status,
      dueAt: schema.tasks.dueAt,
      checkin: schema.tasks.checkin,
      checkinNote: schema.tasks.checkinNote,
      unanswered: schema.tasks.unanswered,
      askedAt: schema.tasks.askedAt,
      answeredAt: schema.tasks.answeredAt,
      completedAt: schema.tasks.completedAt,
      followUpBy: schema.tasks.followUpBy,
      assignee: assignee.name,
      manager: manager.name,
      clientName: schema.clients.name,
    })
    .from(schema.tasks)
    .leftJoin(assignee, eq(assignee.id, schema.tasks.assigneeId))
    .leftJoin(manager, eq(manager.id, schema.tasks.followUpBy))
    .leftJoin(schema.clients, eq(schema.clients.id, schema.tasks.clientId))
    .where(
      and(
        managerId ? eq(schema.tasks.followUpBy, managerId) : isNotNull(schema.tasks.followUpBy),
        or(ne(schema.tasks.status, "done"), gte(schema.tasks.completedAt, since)),
      ),
    );
}

// Every morning: each manager gets the state of the tasks the assistant follows for them
export async function sendFollowUpDigests(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const tasks = await followedTasks(null, since);
  const byManager = new Map<string, typeof tasks>();
  for (const t of tasks) byManager.set(t.followUpBy!, [...(byManager.get(t.followUpBy!) ?? []), t]);
  let sent = 0;
  for (const [managerId, list] of byManager) {
    const groups = groupForDigest(list, now, since);
    if (digestEmpty(groups)) continue;
    const text = digestText(groups);
    const summary = await aiSummary(text);
    await notifyUsers([managerId], {
      title: `گزارش پیگیری: ${toPersianDigits(groups.done.length)} تمام شد، ${toPersianDigits(groups.blocked.length + groups.silent.length + groups.late.length)} نیاز به توجه`,
      body: summary ? `${summary}\n\n${text}` : text,
      href: "/tasks/follow-up",
    });
    sent++;
  }
  return sent;
}

// A two-sentence read of the digest when a Claude key is set; the plain report stands alone otherwise
async function aiSummary(digest: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await callClaude({
      system:
        "You are the project assistant of a small Iranian content agency. Read the follow-up report and tell the manager, in at most two short Persian sentences, what needs their attention first and why. No greeting, no lists, no markdown.",
      messages: [{ role: "user", content: digest }],
      maxTokens: 2000,
      effort: "low",
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return text ? `🤖 ${text}` : null;
  } catch (error) {
    console.error("[follow-up] AI summary failed", error);
    return null;
  }
}

export async function taskHistory(taskIds: string[]) {
  if (taskIds.length === 0) return [];
  return db
    .select({ taskId: schema.taskUpdates.taskId, kind: schema.taskUpdates.kind, note: schema.taskUpdates.note, createdAt: schema.taskUpdates.createdAt })
    .from(schema.taskUpdates)
    .where(inArray(schema.taskUpdates.taskId, taskIds))
    .orderBy(schema.taskUpdates.createdAt);
}
