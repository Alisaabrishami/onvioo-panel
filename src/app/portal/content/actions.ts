"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { parseTimecode } from "@/lib/content";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { notifyTeam } from "@/lib/notify";
import { approveAsClient, ownContent, requestChangesAsClient } from "@/lib/client-review";

function readComment(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  const timecodeText = String(formData.get("timecode") ?? "");
  return { body, timecodeText, timecode: parseTimecode(timecodeText) };
}

export async function approveContent(contentId: string): Promise<{ ok: boolean }> {
  const user = await requireClient();
  const content = isUuid(contentId) ? await ownContent(contentId, user.clientId) : null;
  if (!content || content.stage !== "client_review") return { ok: false };
  await approveAsClient(user, content);
  return { ok: true };
}

// Sends the content back to editing with the client's notes as a comment
export async function requestChanges(contentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  const content = isUuid(contentId) ? await ownContent(contentId, user.clientId) : null;
  if (!content || content.stage !== "client_review") return { message: "این محتوا دیگر منتظر بررسی شما نیست" };
  const { body, timecode, timecodeText } = readComment(formData);
  const values = { body, timecode: timecodeText };
  if (!body) return { errors: { body: ["بنویسید چه چیزی باید تغییر کند"] }, values };
  if (timecode === undefined) return { errors: { timecode: ["زمان را مثل ۱:۰۵ بنویسید"] }, values };

  await requestChangesAsClient(user, content, body, timecode);
  return { ok: true };
}

export async function addClientComment(contentId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  const content = isUuid(contentId) ? await ownContent(contentId, user.clientId) : null;
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
