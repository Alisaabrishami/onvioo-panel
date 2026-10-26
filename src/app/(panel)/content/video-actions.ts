"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as z from "zod";
import { db, schema } from "@/db";
import type { VideoJobKind } from "@/db/schema";
import { AiUnavailableError, aiConfigured } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { toPersianDigits } from "@/lib/format";
import { storageConfigured } from "@/lib/storage";
import { transcribeConfigured } from "@/lib/transcribe";
import { CLIP_MAX_SECONDS, CLIP_MIN_SECONDS, normalizeSegments } from "@/lib/video";
import { enqueueVideoJob, runVideoJobs, suggestClips } from "@/lib/video-jobs";

async function videoFile(fileId: string) {
  if (!isUuid(fileId)) return null;
  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, fileId));
  return file && file.mime.startsWith("video/") ? file : null;
}

function revalidate(file: { id: string; contentId: string | null }) {
  if (file.contentId) {
    revalidatePath(`/content/${file.contentId}`);
    revalidatePath(`/content/${file.contentId}/video/${file.id}`);
  }
}

// One job of a kind per file at a time
async function busy(fileId: string, kind: VideoJobKind) {
  const [open] = await db
    .select({ id: schema.videoJobs.id })
    .from(schema.videoJobs)
    .where(and(eq(schema.videoJobs.fileId, fileId), eq(schema.videoJobs.kind, kind), inArray(schema.videoJobs.status, ["queued", "running"])));
  return !!open;
}

async function queue(kind: VideoJobKind, fileId: string, userId: string, options: Record<string, unknown> = {}) {
  await enqueueVideoJob(kind, fileId, userId, options);
  // Starts right after the response; the cron route picks up anything left over
  after(() => runVideoJobs());
}

export async function startTranscribe(fileId: string): Promise<FormState> {
  const user = await requireTeam();
  const file = await videoFile(fileId);
  if (!file) return { message: "ویدیو پیدا نشد" };
  if (!storageConfigured()) return { message: "فضای ذخیره‌سازی تنظیم نشده است" };
  if (!transcribeConfigured()) return { message: "سرویس تبدیل گفتار به متن (Whisper) هنوز تنظیم نشده است" };
  if (await busy(fileId, "transcribe")) return { message: "این ویدیو در صف زیرنویس است" };
  await queue("transcribe", fileId, user.id);
  await audit(user.id, "transcribe", "file", fileId);
  revalidate(file);
  return { ok: true, message: "در صف قرار گرفت؛ وقتی آماده شد خبرتان می‌کنیم" };
}

const segmentsSchema = z
  .array(z.object({ start: z.number().min(0), end: z.number().positive(), text: z.string().max(400) }))
  .max(5000);

export async function saveTranscript(fileId: string, segments: unknown): Promise<FormState> {
  const user = await requireTeam();
  const file = await videoFile(fileId);
  if (!file) return { message: "ویدیو پیدا نشد" };
  const parsed = segmentsSchema.safeParse(segments);
  if (!parsed.success) return { message: "زمان‌ها یا متن‌ها معتبر نیستند" };
  const clean = normalizeSegments(parsed.data);
  if (clean.length === 0) return { message: "حداقل یک خط زیرنویس لازم است" };
  const updated = await db
    .update(schema.transcripts)
    .set({ segments: clean, editedBy: user.id, updatedAt: new Date() })
    .where(eq(schema.transcripts.fileId, fileId))
    .returning({ fileId: schema.transcripts.fileId });
  if (updated.length === 0) return { message: "زیرنویسی برای این ویدیو نیست" };
  revalidate(file);
  return { ok: true, message: "زیرنویس ذخیره شد" };
}

const styleSchema = z.object({
  position: z.enum(["bottom", "middle"]).catch("bottom"),
  size: z.enum(["small", "medium", "large"]).catch("medium"),
});

export async function startBurn(fileId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const file = await videoFile(fileId);
  if (!file) return { message: "ویدیو پیدا نشد" };
  const [t] = await db.select({ fileId: schema.transcripts.fileId }).from(schema.transcripts).where(eq(schema.transcripts.fileId, fileId));
  if (!t) return { message: "اول زیرنویس را بسازید" };
  if (await busy(fileId, "burn")) return { message: "این ویدیو در صف است" };
  const style = styleSchema.parse({ position: formData.get("position"), size: formData.get("size") });
  await queue("burn", fileId, user.id, { style });
  revalidate(file);
  return { ok: true, message: "در صف قرار گرفت؛ نسخه زیرنویس‌دار به فایل‌های همین محتوا اضافه می‌شود" };
}

export async function findClips(fileId: string): Promise<FormState> {
  await requireTeam();
  const file = await videoFile(fileId);
  if (!file) return { message: "ویدیو پیدا نشد" };
  if (!aiConfigured()) return { message: "کلید API هوش مصنوعی تنظیم نشده است" };
  try {
    const result = await suggestClips(fileId);
    if (!result.ok) return { message: result.error };
    revalidate(file);
    return result.count ? { ok: true, message: `${toPersianDigits(result.count)} لحظه پیدا شد` } : { message: "لحظه مناسبی برای کلیپ پیدا نشد" };
  } catch (error) {
    if (error instanceof AiUnavailableError) return { message: "کلید API هوش مصنوعی تنظیم نشده است" };
    console.error("clip ideas failed", error);
    return { message: "پیدا کردن کلیپ‌ها ناموفق بود؛ دوباره امتحان کنید" };
  }
}

const clipSchema = z
  .object({
    title: z.string().trim().min(2, { error: "عنوان کلیپ را بنویسید" }).max(120),
    start: z.coerce.number().min(0),
    end: z.coerce.number(),
    hook: z.string().max(300).catch(""),
    subtitles: z.preprocess((v) => v === "on", z.boolean()),
  })
  .refine((c) => c.end - c.start >= CLIP_MIN_SECONDS && c.end - c.start <= CLIP_MAX_SECONDS, {
    error: `طول کلیپ باید بین ${CLIP_MIN_SECONDS} تا ${CLIP_MAX_SECONDS} ثانیه باشد`,
    path: ["end"],
  });

export async function cutClip(fileId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const file = await videoFile(fileId);
  if (!file) return { message: "ویدیو پیدا نشد" };
  const parsed = clipSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: z.flattenError(parsed.error).fieldErrors.end?.[0] ?? parsed.error.issues[0].message };
  await queue("clip", fileId, user.id, { ...parsed.data, style: { position: "bottom", size: "medium" } });
  revalidate(file);
  return { ok: true, message: "برش در صف قرار گرفت؛ کلیپ به‌صورت یک محتوای تازه اضافه می‌شود" };
}

export async function retryJob(jobId: string): Promise<FormState> {
  await requireTeam();
  if (!isUuid(jobId)) return { message: "پیدا نشد" };
  const [job] = await db
    .update(schema.videoJobs)
    .set({ status: "queued", error: null, attempts: 0, finishedAt: null })
    .where(and(eq(schema.videoJobs.id, jobId), eq(schema.videoJobs.status, "failed")))
    .returning({ fileId: schema.videoJobs.fileId });
  if (!job) return { message: "این کار قابل تکرار نیست" };
  after(() => runVideoJobs());
  const file = await videoFile(job.fileId);
  if (file) revalidate(file);
  return { ok: true, message: "دوباره در صف قرار گرفت" };
}
