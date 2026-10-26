import "server-only";
import { and, eq, inArray, isNull, max, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { buildObjectKey, presignUpload, storageConfigured, storedSize } from "@/lib/storage";
import { type Actor, OpsError, fieldError, missing, parseInput } from "./errors";

// Files go straight from the browser or the app to storage with a presigned
// PUT, then get registered here. Shared by the panel uploader, ticket
// attachments and the mobile API.

// 5 GB is the single-request limit of S3-compatible stores
export const MAX_UPLOAD = 5 * 1024 * 1024 * 1024;
// Clients send attachments and brand assets, not footage
export const MAX_CLIENT_UPLOAD = 500 * 1024 * 1024;

export const uploadInput = z.object({
  name: z.string().trim().min(1, { error: "نام فایل لازم است" }).max(255),
  size: z.number().int().positive({ error: "حجم فایل معتبر نیست" }),
  mime: z.string().trim().min(1).max(255).default("application/octet-stream"),
  clientId: z.uuid({ error: "مشتری معتبر نیست" }).nullable().optional(),
  contentId: z.uuid({ error: "محتوا معتبر نیست" }).nullable().optional(),
  kind: z.enum(schema.fileKindEnum.enumValues).optional(),
});
export type UploadInput = z.input<typeof uploadInput>;

function unavailable() {
  return new OpsError("storage_unavailable", "فضای ذخیره‌سازی هنوز تنظیم نشده است", 503);
}

// Who owns the upload and where it is filed. A client always files into their
// own account, as a plain attachment.
async function placement(actor: Actor, input: z.infer<typeof uploadInput>) {
  if (actor.role === "client") {
    if (!actor.clientId) throw new OpsError("forbidden", "این بخش برای حساب شما نیست", 403);
    if (input.size > MAX_CLIENT_UPLOAD) throw fieldError("size", "حجم فایل بیشتر از ۵۰۰ مگابایت است");
    return { clientId: actor.clientId, contentId: null, kind: "other" as const };
  }
  if (input.size > MAX_UPLOAD) throw fieldError("size", "حجم فایل بیشتر از ۵ گیگابایت است");
  let clientId = input.clientId ?? null;
  const contentId = input.contentId ?? null;
  if (contentId) {
    const [content] = await db.select({ clientId: schema.contents.clientId }).from(schema.contents).where(eq(schema.contents.id, contentId));
    if (!content) throw fieldError("contentId", "محتوا پیدا نشد");
    clientId = content.clientId;
  } else if (clientId) {
    const [client] = await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, clientId));
    if (!client) throw fieldError("clientId", "مشتری پیدا نشد");
  }
  return { clientId, contentId, kind: input.kind ?? (contentId ? "edit" : "other") };
}

export type UploadIntent = { key: string; uploadUrl: string; method: "PUT"; headers: Record<string, string>; expiresIn: number };

export async function startUpload(actor: Actor, raw: UploadInput): Promise<UploadIntent> {
  if (!storageConfigured()) throw unavailable();
  const input = parseInput(uploadInput, raw);
  const { clientId } = await placement(actor, input);
  const key = buildObjectKey(input.name, clientId);
  return { key, uploadUrl: await presignUpload(key, input.mime), method: "PUT", headers: { "Content-Type": input.mime }, expiresIn: 3600 };
}

// The key must be one this person could have been given: under their client's
// folder for a client, never registered twice, and actually stored
export async function finishUpload(actor: Actor, raw: UploadInput & { key: string }) {
  if (!storageConfigured()) throw unavailable();
  const { key, ...rest } = raw;
  const input = parseInput(uploadInput, rest);
  const where = await placement(actor, input);
  const folder = `${where.clientId ?? "general"}/`;
  if (typeof key !== "string" || !key.startsWith(folder) || key.includes("..")) throw fieldError("key", "کلید فایل معتبر نیست");
  const [existing] = await db.select({ id: schema.files.id }).from(schema.files).where(eq(schema.files.key, key));
  if (existing) throw new OpsError("conflict", "این فایل قبلاً ثبت شده است", 409);
  const size = await storedSize(key);
  if (size === null) throw new OpsError("not_uploaded", "فایل هنوز در فضای ذخیره‌سازی نیست؛ اول آپلود را کامل کنید", 409);

  let version: number | null = null;
  if (where.contentId && where.kind === "edit") {
    // Each new edit of a content item is the next version: v1, v2…
    const [row] = await db
      .select({ max: max(schema.files.version) })
      .from(schema.files)
      .where(and(eq(schema.files.contentId, where.contentId), eq(schema.files.kind, "edit")));
    version = (row?.max ?? 0) + 1;
  }
  const [file] = await db
    .insert(schema.files)
    .values({ key, name: input.name, mime: input.mime, size, ...where, version, uploadedBy: actor.id })
    .returning();
  await audit(actor.id, "upload", "file", file.id, { name: input.name });
  revalidatePath("/files");
  if (where.clientId) revalidatePath(`/clients/${where.clientId}`);
  if (where.contentId) revalidatePath(`/content/${where.contentId}`);
  return file;
}

// Files this person uploaded and has not attached anywhere yet, for one client.
// Used to attach uploads to a ticket message.
export async function claimAttachments(actor: Actor, fileIds: string[], clientId: string, ticketMessageId: string, tx: Pick<typeof db, "update"> = db) {
  const ids = [...new Set(fileIds)];
  if (ids.length === 0) return 0;
  const claimed = await tx
    .update(schema.files)
    // Filed under the ticket's client so both sides can download it
    .set({ ticketMessageId, clientId })
    .where(
      and(
        inArray(schema.files.id, ids),
        eq(schema.files.uploadedBy, actor.id),
        isNull(schema.files.ticketMessageId),
        isNull(schema.files.contentId),
        actor.role === "client" ? eq(schema.files.clientId, clientId) : or(isNull(schema.files.clientId), eq(schema.files.clientId, clientId)),
      ),
    )
    .returning({ id: schema.files.id });
  if (claimed.length !== ids.length) throw fieldError("fileIds", "یکی از فایل‌های پیوست پیدا نشد یا قبلاً جای دیگری استفاده شده");
  return claimed.length;
}

// One file the caller may open. Clients see their own account's files except
// raw footage and finance receipts; staff see everything but receipts.
export async function visibleFile(actor: Actor, id: string) {
  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, id));
  if (!file) throw missing();
  if (actor.role === "client" && (file.clientId !== actor.clientId || file.kind === "raw")) throw missing();
  if (actor.role !== "admin") {
    const [receipt] = await db.select({ id: schema.transactions.id }).from(schema.transactions).where(eq(schema.transactions.receiptFileId, id));
    if (receipt) throw missing();
  }
  return file;
}
