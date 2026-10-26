"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin, requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type CheckinAnswer, answerCheckin, followedTaskDone, startFollowUp, stopFollowUp } from "@/lib/follow-up-run";
import { type FormState, invalid, jalaliField, optionalJalali, optionalText, optionalUuid } from "@/lib/forms";

const taskSchema = z.object({
  title: z.string().trim().min(2, { error: "عنوان کار را بنویسید" }),
  description: optionalText,
  priority: z.enum(schema.taskPriorityEnum.enumValues),
  assigneeId: optionalUuid,
  clientId: optionalUuid,
  dueAt: optionalJalali,
});

const everySchema = z.coerce.number().int().min(1).max(3).catch(1);

export async function createTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = taskSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    priority: formData.get("priority") ?? "normal",
    assigneeId: formData.get("assigneeId") ?? "",
    clientId: formData.get("clientId") ?? "",
    dueAt: jalaliField(formData, "dueAt"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);
  const [task] = await db
    .insert(schema.tasks)
    .values({ ...parsed.data, createdBy: user.id })
    .returning({ id: schema.tasks.id });
  await audit(user.id, "create", "task", task.id, { title: parsed.data.title });
  // Managers can hand the follow-up to the assistant
  const followUp = user.role === "admin" && formData.get("followUp") === "on" && parsed.data.assigneeId;
  if (followUp) await startFollowUp(user.id, task.id, everySchema.parse(formData.get("followUpEvery")));
  revalidatePath("/tasks");
  return { ok: true, message: followUp ? "کار اضافه شد و دستیار پیگیرش است" : "کار اضافه شد" };
}

export async function setTaskStatus(taskId: string, status: string): Promise<void> {
  const user = await requireTeam();
  const parsed = z.enum(schema.taskStatusEnum.enumValues).safeParse(status);
  if (!isUuid(taskId) || !parsed.success) return;
  await db
    .update(schema.tasks)
    .set({ status: parsed.data, completedAt: parsed.data === "done" ? new Date() : null })
    .where(eq(schema.tasks.id, taskId));
  await audit(user.id, "status", "task", taskId, { status: parsed.data });
  if (parsed.data === "done") await followedTaskDone(taskId, user.id, "panel");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function setFollowUp(taskId: string, on: boolean): Promise<void> {
  const user = await requireAdmin();
  if (!isUuid(taskId)) return;
  if (on) await startFollowUp(user.id, taskId, 1);
  else await stopFollowUp(taskId);
  await audit(user.id, on ? "follow_up" : "unfollow", "task", taskId);
}

export async function answerFollowUp(taskId: string, answer: CheckinAnswer, note?: string): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(taskId) || !["done", "on_track", "blocked"].includes(answer)) return;
  await answerCheckin(user.id, taskId, answer, { note: note ?? null, via: "panel" });
}

export async function deleteTask(taskId: string): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(taskId)) return;
  // Admins delete any task; others only tasks they created by hand
  const owner = user.role === "admin" ? undefined : eq(schema.tasks.createdBy, user.id);
  await db.delete(schema.tasks).where(and(eq(schema.tasks.id, taskId), owner));
  revalidatePath("/tasks");
}
