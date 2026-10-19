"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireClient } from "@/lib/auth/dal";
import { parseTimecode } from "@/lib/content";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { notifyTeam } from "@/lib/notify";
import { moveContentStage } from "@/lib/pipeline";

// The client's own content only, and never ideas the team has not started
async function ownContent(contentId: string, clientId: string) {
  if (!isUuid(contentId)) return null;
  const [content] = await db
    .select()
    .from(schema.contents)
    .where(and(eq(schema.contents.id, contentId), eq(schema.contents.clientId, clientId), ne(schema.contents.stage, "idea")));
  return content ?? null;
}

function readComment(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  const timecodeText = String(formData.get("timecode") ?? "");
  return { body, timecodeText, timecode: parseTimecode(timecodeText) };
}

export async function approveContent(contentId: string): Promise<{ ok: boolean }> {
  const user = await requireClient();
  const content = await ownContent(contentId, user.clientId);
  if (!content || content.stage !== "client_review") return { ok: false };
  await moveContentStage(content.id, "ready", user.id);
  await audit(user.id, "approve", "content", content.id);
  await notifyTeam(
    { title: `مشتری «${content.title}» را تأیید کرد`, body: `تأیید توسط ${user.name}`, href: `/content/${content.id}` },
    [content.assigneeId],
  );
  revalidatePath(`/portal/content/${content.id}`);
  revalidatePath("/portal");
  return { ok: true };
}

// Sends the content back to editing with the client's notes as a comment
export async function requestChanges(contentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  const content = await ownContent(contentId, user.clientId);
  if (!content || content.stage !== "client_review") return { message: "این محتوا دیگر منتظر بررسی شما نیست" };
  const { body, timecode, timecodeText } = readComment(formData);
  const values = { body, timecode: timecodeText };
  if (!body) return { errors: { body: ["بنویسید چه چیزی باید تغییر کند"] }, values };
  if (timecode === undefined) return { errors: { timecode: ["زمان را مثل ۱:۰۵ بنویسید"] }, values };

  await db.insert(schema.contentComments).values({ contentId: content.id, userId: user.id, body, timecode });
  await moveContentStage(content.id, "editing", user.id);
  await audit(user.id, "request_changes", "content", content.id);
  await notifyTeam(
    { title: `مشتری برای «${content.title}» اصلاحیه خواست`, body, href: `/content/${content.id}` },
    [content.assigneeId],
  );
  revalidatePath(`/portal/content/${content.id}`);
  revalidatePath("/portal");
  return { ok: true };
}

export async function addClientComment(contentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  const content = await ownContent(contentId, user.clientId);
  if (!content) return { message: "محتوا پیدا نشد" };
  const { body, timecode, timecodeText } = readComment(formData);
  const values = { body, timecode: timecodeText };
  if (!body) return { errors: { body: ["متن پیام را بنویسید"] }, values };
  if (timecode === undefined) return { errors: { timecode: ["زمان را مثل ۱:۰۵ بنویسید"] }, values };

  await db.insert(schema.contentComments).values({ contentId: content.id, userId: user.id, body, timecode });
  await notifyTeam({ title: `پیام مشتری روی «${content.title}»`, body, href: `/content/${content.id}` }, [content.assigneeId]);
  revalidatePath(`/portal/content/${content.id}`);
  return { ok: true };
}
