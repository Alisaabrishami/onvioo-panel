"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireTeam } from "@/lib/auth/dal";
import { buildObjectKey, presignUpload, storageConfigured } from "@/lib/storage";

// 5 GB is the single-request limit of S3-compatible stores
const MAX_SIZE = 5 * 1024 * 1024 * 1024;

const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_SIZE),
  mime: z.string().min(1).max(255),
  clientId: z.uuid().nullable(),
  contentId: z.uuid().nullable().optional(),
  kind: z.enum(schema.fileKindEnum.enumValues).optional(),
});

export type UploadTicket =
  | { ok: true; uploadUrl: string; key: string }
  | { ok: false; error: string };

export async function startUpload(input: z.input<typeof uploadSchema>): Promise<UploadTicket> {
  await requireTeam();
  if (!storageConfigured()) {
    return { ok: false, error: "فضای ذخیره‌سازی هنوز تنظیم نشده است" };
  }
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "فایل معتبر نیست یا بیشتر از ۵ گیگابایت است" };

  const { name, mime, clientId } = parsed.data;
  if (clientId) {
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(eq(schema.clients.id, clientId));
    if (!client) return { ok: false, error: "مشتری پیدا نشد" };
  }
  const key = buildObjectKey(name, clientId);
  return { ok: true, key, uploadUrl: await presignUpload(key, mime) };
}

// Called after the browser finished the PUT to storage
export async function completeUpload(
  input: z.input<typeof uploadSchema> & { key: string },
): Promise<{ ok: boolean }> {
  const user = await requireTeam();
  const parsed = uploadSchema.extend({ key: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false };

  const { contentId, kind = "other" } = parsed.data;
  let version: number | null = null;
  if (contentId && kind === "edit") {
    // Each new edit of a content item is the next version: v1, v2…
    const [row] = await db
      .select({ max: max(schema.files.version) })
      .from(schema.files)
      .where(and(eq(schema.files.contentId, contentId), eq(schema.files.kind, "edit")));
    version = (row?.max ?? 0) + 1;
  }
  const [file] = await db
    .insert(schema.files)
    .values({ ...parsed.data, kind, version, uploadedBy: user.id })
    .returning({ id: schema.files.id });
  await audit(user.id, "upload", "file", file.id, { name: parsed.data.name });
  revalidatePath("/files");
  if (parsed.data.clientId) revalidatePath(`/clients/${parsed.data.clientId}`);
  if (contentId) revalidatePath(`/content/${contentId}`);
  return { ok: true };
}
