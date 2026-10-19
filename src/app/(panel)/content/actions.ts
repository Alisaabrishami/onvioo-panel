"use server";

import { and, eq, isNotNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireTeam } from "@/lib/auth/dal";
import { type FormState, invalid, jalaliField, optionalJalali, optionalText, optionalUuid } from "@/lib/forms";
import { isUuid } from "@/lib/data";
import { toLatinDigits } from "@/lib/format";
import { moveContentStage } from "@/lib/pipeline";
import { REVIEW_TASK_KEY } from "@/lib/content";

const contentSchema = z.object({
  title: z.string().trim().min(2, { error: "عنوان محتوا را وارد کنید" }),
  clientId: z.uuid({ error: "مشتری را انتخاب کنید" }),
  type: z.enum(schema.contentTypeEnum.enumValues),
  assigneeId: optionalUuid,
  shootId: optionalUuid,
  dueAt: optionalJalali,
  publishAt: optionalJalali,
  caption: optionalText,
  hashtags: optionalText,
  notes: optionalText,
});

function readContentForm(formData: FormData) {
  return contentSchema.safeParse({
    title: formData.get("title") ?? "",
    clientId: formData.get("clientId") ?? "",
    type: formData.get("type") ?? "reel",
    assigneeId: formData.get("assigneeId") ?? "",
    shootId: formData.get("shootId") ?? "",
    dueAt: jalaliField(formData, "dueAt"),
    publishAt: jalaliField(formData, "publishAt"),
    caption: formData.get("caption") ?? "",
    hashtags: formData.get("hashtags") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

function revalidateContent(id?: string) {
  revalidatePath("/content");
  revalidatePath("/calendar");
  revalidatePath("/tasks");
  if (id) revalidatePath(`/content/${id}`);
}

export async function createContent(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = readContentForm(formData);
  if (!parsed.success) return invalid(parsed.error, formData);

  const [content] = await db
    .insert(schema.contents)
    .values({ ...parsed.data, createdBy: user.id })
    .returning({ id: schema.contents.id, stage: schema.contents.stage });
  await db.insert(schema.contentEvents).values({ contentId: content.id, userId: user.id, toStage: content.stage });
  await audit(user.id, "create", "content", content.id, { title: parsed.data.title });
  revalidateContent();
  redirect(`/content/${content.id}`);
}

export async function updateContent(contentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = readContentForm(formData);
  if (!parsed.success) return invalid(parsed.error, formData);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.contents)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.contents.id, contentId));
    const openAuto = and(
      eq(schema.tasks.contentId, contentId),
      isNotNull(schema.tasks.autoKey),
      ne(schema.tasks.status, "done"),
    );
    await tx
      .update(schema.tasks)
      .set({ dueAt: parsed.data.dueAt, clientId: parsed.data.clientId })
      .where(openAuto);
    // The open pipeline task follows the content to its new editor; review stays with the reviewer
    await tx
      .update(schema.tasks)
      .set({ assigneeId: parsed.data.assigneeId })
      .where(and(openAuto, ne(schema.tasks.autoKey, REVIEW_TASK_KEY)));
  });
  await audit(user.id, "update", "content", contentId, { title: parsed.data.title });
  revalidateContent(contentId);
  return { ok: true, message: "ذخیره شد" };
}

export async function moveStage(contentId: string, stage: string): Promise<{ ok: boolean }> {
  const user = await requireTeam();
  const parsed = z.enum(schema.contentStageEnum.enumValues).safeParse(stage);
  if (!isUuid(contentId) || !parsed.success) return { ok: false };
  const ok = await moveContentStage(contentId, parsed.data, user.id);
  if (ok) {
    await audit(user.id, "move", "content", contentId, { stage: parsed.data });
    revalidateContent(contentId);
  }
  return { ok };
}

// "1:05" or "65" (seconds) into seconds
function parseTimecode(text: string): number | null | undefined {
  const t = toLatinDigits(text).trim();
  if (!t) return null;
  const m = t.match(/^(?:(\d+):)?(\d{1,2})$/) ?? t.match(/^(\d+)$/);
  if (!m) return undefined;
  return m.length === 3 ? Number(m[1] ?? 0) * 60 + Number(m[2]) : Number(m[1]);
}

export async function addComment(contentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const body = String(formData.get("body") ?? "").trim();
  const timecode = parseTimecode(String(formData.get("timecode") ?? ""));
  const values = { body, timecode: String(formData.get("timecode") ?? "") };
  if (!body) return { errors: { body: ["متن نظر را بنویسید"] }, values };
  if (timecode === undefined) return { errors: { timecode: ["زمان را مثل ۱:۰۵ بنویسید"] }, values };

  await db.insert(schema.contentComments).values({ contentId, userId: user.id, body, timecode });
  revalidatePath(`/content/${contentId}`);
  return { ok: true };
}

export async function deleteContent(contentId: string): Promise<void> {
  const user = await requireTeam();
  if (user.role !== "admin" || !isUuid(contentId)) return;
  await db.delete(schema.contents).where(eq(schema.contents.id, contentId));
  await audit(user.id, "delete", "content", contentId);
  revalidateContent();
  redirect("/content");
}
