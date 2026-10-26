import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, lt, max, sql } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import type { Segment, VideoJobKind } from "@/db/schema";
import { askClaude } from "./ai";
import { formatTimecode } from "./content";
import { notifyUsers } from "./notify";
import { buildObjectKey, downloadToFile, uploadFile } from "./storage";
import { transcribeAudio } from "./transcribe";
import {
  CLIP_MAX_SECONDS,
  CLIP_MIN_SECONDS,
  DEFAULT_STYLE,
  type SubtitleStyle,
  cleanClipIdeas,
  fitFrame,
  normalizeSegments,
  sliceSegments,
  toAss,
  transcriptForPrompt,
  verticalFilter,
} from "./video";

type Job = typeof schema.videoJobs.$inferSelect;
type FileRow = typeof schema.files.$inferSelect;

const STALE_MINUTES = 90;
const MAX_ATTEMPTS = 2;

export async function enqueueVideoJob(kind: VideoJobKind, fileId: string, userId: string, options: Record<string, unknown> = {}) {
  const [job] = await db.insert(schema.videoJobs).values({ kind, fileId, options, createdBy: userId }).returning({ id: schema.videoJobs.id });
  return job.id;
}

// ---------- the runner ----------

let running = false;

// Works through the queue one job at a time. Called right after a job is
// queued and by the /api/cron/video safety net; a second call while one is
// working returns at once, and the row lock keeps two servers apart.
export async function runVideoJobs(limit = 20): Promise<number> {
  if (running) return 0;
  running = true;
  let done = 0;
  try {
    await requeueStale();
    for (; done < limit; done++) {
      const job = await claimJob();
      if (!job) break;
      await runJob(job);
    }
  } finally {
    running = false;
  }
  return done;
}

async function requeueStale() {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000);
  await db
    .update(schema.videoJobs)
    .set({ status: sql`case when ${schema.videoJobs.attempts} >= ${MAX_ATTEMPTS} then 'failed'::job_status else 'queued'::job_status end`, error: "کار نیمه‌تمام ماند" })
    .where(and(eq(schema.videoJobs.status, "running"), lt(schema.videoJobs.startedAt, cutoff)));
}

async function claimJob(): Promise<Job | null> {
  const rows = await db.execute<{ id: string }>(sql`
    update video_jobs set status = 'running', started_at = now(), attempts = attempts + 1, error = null
    where id = (select id from video_jobs where status = 'queued' order by created_at limit 1 for update skip locked)
    returning id`);
  const id = rows.rows[0]?.id;
  if (!id) return null;
  const [job] = await db.select().from(schema.videoJobs).where(eq(schema.videoJobs.id, id));
  return job ?? null;
}

async function runJob(job: Job) {
  const dir = await mkdtemp(path.join(tmpdir(), "onvioo-video-"));
  try {
    const [file] = await db.select().from(schema.files).where(eq(schema.files.id, job.fileId));
    if (!file) throw new JobError("فایل اصلی پیدا نشد");
    const source = path.join(dir, `source${path.extname(file.name) || ".mp4"}`);
    await downloadToFile(file.key, source);
    const result = await HANDLERS[job.kind](job, file, source, dir);
    await db
      .update(schema.videoJobs)
      .set({ status: "done", finishedAt: new Date(), ...result })
      .where(eq(schema.videoJobs.id, job.id));
    await notifyUsers([job.createdBy], doneNotice(job, file, result));
  } catch (error) {
    console.error(`video job ${job.id} (${job.kind}) failed`, error);
    const message = error instanceof JobError ? error.message : "پردازش ویدیو ناموفق بود";
    const retry = !(error instanceof JobError) && job.attempts < MAX_ATTEMPTS;
    await db
      .update(schema.videoJobs)
      .set({ status: retry ? "queued" : "failed", error: message, finishedAt: retry ? null : new Date() })
      .where(eq(schema.videoJobs.id, job.id));
    if (!retry) await notifyUsers([job.createdBy], { title: `${message}: ${await fileName(job.fileId)}`, href: await studioHref(job.fileId) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A failure worth showing as is; anything else is retried once
class JobError extends Error {}

type JobResult = { outputFileId?: string; outputContentId?: string };

const HANDLERS: Record<VideoJobKind, (job: Job, file: FileRow, source: string, dir: string) => Promise<JobResult>> = {
  transcribe: transcribeJob,
  burn: burnJob,
  clip: clipJob,
};

function doneNotice(job: Job, file: FileRow, result: JobResult) {
  if (job.kind === "clip" && result.outputContentId) return { title: `کلیپ «${String(job.options.title ?? "")}» آماده شد`, href: `/content/${result.outputContentId}` };
  const href = file.contentId ? `/content/${file.contentId}/video/${file.id}` : "/files";
  return job.kind === "transcribe"
    ? { title: `زیرنویس «${file.name}» آماده ویرایش است`, href }
    : { title: `نسخه زیرنویس‌دار «${file.name}» آماده شد`, href };
}

async function fileName(fileId: string) {
  const [f] = await db.select({ name: schema.files.name }).from(schema.files).where(eq(schema.files.id, fileId));
  return f?.name ?? "";
}

async function studioHref(fileId: string) {
  const [f] = await db.select({ contentId: schema.files.contentId }).from(schema.files).where(eq(schema.files.id, fileId));
  return f?.contentId ? `/content/${f.contentId}/video/${fileId}` : "/files";
}

// ---------- ffmpeg ----------

function run(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    child.on("error", (e) => reject(new JobError(e.message.includes("ENOENT") ? "ffmpeg روی سرور نصب نیست" : e.message)));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err}`))));
  });
}

export async function probe(file: string): Promise<{ duration: number; width: number; height: number; audio: boolean }> {
  const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", file]);
  const info = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_type: string; width?: number; height?: number }[] };
  const video = info.streams?.find((s) => s.codec_type === "video");
  if (!video?.width || !video.height) throw new JobError("این فایل ویدیو نیست یا خوانده نشد");
  return {
    duration: Number(info.format?.duration ?? 0),
    width: video.width,
    height: video.height,
    audio: !!info.streams?.some((s) => s.codec_type === "audio"),
  };
}

function fontsDir() {
  return process.env.VIDEO_FONTS_DIR ?? path.join(process.cwd(), "assets", "fonts");
}

// Escapes a path for use inside an ffmpeg filter argument
function filterPath(p: string) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

const ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"];

// ---------- handlers ----------

async function transcribeJob(job: Job, file: FileRow, source: string, dir: string): Promise<JobResult> {
  const info = await probe(source);
  if (!info.audio) throw new JobError("این ویدیو صدا ندارد");
  const audio = path.join(dir, "audio.mp3");
  // 16 kHz mono is all speech recognition needs and keeps the upload small
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", audio]);
  const segments = normalizeSegments(await transcribeAudio(audio, info.duration));
  if (segments.length === 0) throw new JobError("صحبتی در این ویدیو پیدا نشد");
  await db
    .insert(schema.transcripts)
    .values({ fileId: file.id, segments, duration: info.duration })
    .onConflictDoUpdate({
      target: schema.transcripts.fileId,
      set: { segments, duration: info.duration, clipIdeas: null, editedBy: null, updatedAt: new Date() },
    });
  return {};
}

async function loadSegments(fileId: string): Promise<Segment[]> {
  const [t] = await db.select({ segments: schema.transcripts.segments }).from(schema.transcripts).where(eq(schema.transcripts.fileId, fileId));
  if (!t) throw new JobError("اول زیرنویس این ویدیو را بسازید");
  return t.segments;
}

async function burnJob(job: Job, file: FileRow, source: string, dir: string): Promise<JobResult> {
  const info = await probe(source);
  const segments = await loadSegments(file.id);
  const frame = fitFrame(info.width, info.height);
  const assPath = path.join(dir, "subs.ass");
  await writeFile(assPath, toAss(segments, frame.width, frame.height, styleOf(job)));
  const output = path.join(dir, "out.mp4");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", source,
    "-vf", `scale=${frame.width}:${frame.height},ass=${filterPath(assPath)}:fontsdir=${filterPath(fontsDir())}:shaping=complex`,
    ...ENCODE, output,
  ]);
  const name = `${path.parse(file.name).name}-زیرنویس.mp4`;
  const outputFileId = await saveOutput(output, name, file, file.contentId, job.createdBy);
  return { outputFileId };
}

async function clipJob(job: Job, file: FileRow, source: string, dir: string): Promise<JobResult> {
  const opts = clipOptions.parse(job.options);
  const segments = opts.subtitles ? await loadSegments(file.id) : [];
  const output = path.join(dir, "clip.mp4");
  const filters = [verticalFilter()];
  if (opts.subtitles) {
    const assPath = path.join(dir, "clip.ass");
    await writeFile(assPath, toAss(sliceSegments(segments, opts.start, opts.end), 1080, 1920, styleOf(job)));
    filters.push(`ass=${filterPath(assPath)}:fontsdir=${filterPath(fontsDir())}:shaping=complex`);
  }
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", String(opts.start), "-to", String(opts.end), "-i", source,
    "-vf", filters.join(","), ...ENCODE, output,
  ]);

  // Each clip becomes its own content item, ready for the editor to polish
  const [parent] = file.contentId ? await db.select().from(schema.contents).where(eq(schema.contents.id, file.contentId)) : [];
  if (!file.clientId && !parent) throw new JobError("این فایل به مشتری‌ای وصل نیست");
  const [content] = await db
    .insert(schema.contents)
    .values({
      clientId: parent?.clientId ?? file.clientId!,
      title: opts.title,
      type: "reel",
      stage: "editing",
      assigneeId: parent?.assigneeId ?? job.createdBy,
      caption: opts.hook || null,
      notes: `کلیپ خودکار از «${file.name}»، ${formatTimecode(Math.floor(opts.start))} تا ${formatTimecode(Math.ceil(opts.end))}`,
      createdBy: job.createdBy,
    })
    .returning({ id: schema.contents.id });
  await db.insert(schema.contentEvents).values({ contentId: content.id, userId: job.createdBy, fromStage: null, toStage: "editing" });
  const outputFileId = await saveOutput(output, `${opts.title}.mp4`, file, content.id, job.createdBy);
  return { outputFileId, outputContentId: content.id };
}

const clipOptions = z.object({
  start: z.number().min(0),
  end: z.number(),
  title: z.string().trim().min(1).max(120),
  hook: z.string().max(300).optional().default(""),
  subtitles: z.boolean().default(true),
}).refine((o) => o.end - o.start >= CLIP_MIN_SECONDS && o.end - o.start <= CLIP_MAX_SECONDS);

function styleOf(job: Job): SubtitleStyle {
  const s = job.options.style as Partial<SubtitleStyle> | undefined;
  return {
    position: s?.position === "middle" ? "middle" : DEFAULT_STYLE.position,
    size: s?.size === "small" || s?.size === "large" ? s.size : DEFAULT_STYLE.size,
  };
}

// Uploads a rendered video as the next edit version of a content item
async function saveOutput(localPath: string, name: string, source: FileRow, contentId: string | null, userId: string | null): Promise<string> {
  const key = buildObjectKey(name, source.clientId);
  const size = await uploadFile(localPath, key, "video/mp4");
  let version: number | null = null;
  if (contentId) {
    const [row] = await db
      .select({ max: max(schema.files.version) })
      .from(schema.files)
      .where(and(eq(schema.files.contentId, contentId), eq(schema.files.kind, "edit")));
    version = (row?.max ?? 0) + 1;
  }
  const [out] = await db
    .insert(schema.files)
    .values({ key, name, size, mime: "video/mp4", clientId: source.clientId, contentId, kind: "edit", version, uploadedBy: userId })
    .returning({ id: schema.files.id });
  return out.id;
}

// ---------- clip ideas (a quick Claude call, not a queued job) ----------

const ideasSchema = z.object({
  clips: z
    .array(
      z.object({
        start: z.number().describe("Start time in seconds, the start of a transcript line"),
        end: z.number().describe("End time in seconds, the end of a transcript line"),
        title: z.string().describe("Short Persian title for the clip, under 8 words"),
        hook: z.string().describe("Persian caption opening line that makes people stop scrolling"),
        reason: z.string().describe("One Persian sentence on why this moment works as a reel"),
        score: z.number().describe("1-10, how likely it is to perform as a standalone reel"),
      }),
    )
    .max(8),
});

export async function suggestClips(fileId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const [t] = await db.select().from(schema.transcripts).where(eq(schema.transcripts.fileId, fileId));
  if (!t) return { ok: false, error: "اول زیرنویس این ویدیو را بسازید" };
  const duration = t.duration ?? t.segments.at(-1)?.end ?? 0;
  const { clips } = await askClaude({
    system:
      "You are a short-form video editor at an Instagram content agency in Iran. You pick the moments of a long video that work on their own as reels: a strong first sentence, one clear idea, an ending that lands. Write titles, hooks and reasons in natural Persian.",
    prompt: `Video length: ${duration.toFixed(1)} seconds. Transcript with times in seconds:\n\n${transcriptForPrompt(t.segments)}\n\nPick up to 5 non-overlapping moments, each ${CLIP_MIN_SECONDS}–${Math.min(60, CLIP_MAX_SECONDS)} seconds long, starting and ending on line boundaries. Best first.`,
    schema: ideasSchema,
    toolName: "suggest_clips",
    toolDescription: "Return the moments that would work as standalone reels",
    maxTokens: 4000,
    mock: () => ({
      clips: [
        { start: t.segments[0]?.start ?? 0, end: t.segments[Math.min(3, t.segments.length - 1)]?.end ?? 10, title: "معرفی منوی تازه", hook: "این هفته یه چیز جدید داریم 👀", reason: "شروع پرانرژی و معرفی واضح موضوع", score: 8 },
        { start: t.segments[4]?.start ?? 10, end: t.segments.at(-1)?.end ?? 20, title: "تخفیف آخر ماه", hook: "تا آخر ماه همه نوشیدنی‌ها تخفیف دارن!", reason: "پیشنهاد مشخص و دعوت به اقدام", score: 7 },
      ],
    }),
  });
  const ideas = cleanClipIdeas(clips, t.segments, duration);
  await db.update(schema.transcripts).set({ clipIdeas: ideas }).where(eq(schema.transcripts.fileId, fileId));
  return { ok: true, count: ideas.length };
}
