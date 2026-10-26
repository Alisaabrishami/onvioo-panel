import { and, desc, eq } from "drizzle-orm";
import { ArrowRight, Download, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { aiConfigured } from "@/lib/ai";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import { presignView } from "@/lib/storage";
import { transcribeConfigured } from "@/lib/transcribe";
import { JOB_STATUS_LABELS, JOB_STATUS_TONES, VIDEO_JOB_LABELS } from "@/lib/video";
import { cutClip, findClips, retryJob, startBurn, startTranscribe } from "../../../video-actions";
import { BurnForm, ClipForm } from "./forms";
import { JobWatcher, PLAYER_ID, PreviewButton, TranscriptEditor } from "./studio";

export const metadata: Metadata = { title: "استودیوی ویدیو" };

export default async function VideoStudioPage(props: PageProps<"/content/[id]/video/[fileId]">) {
  await requireTeam();
  const { id, fileId } = await props.params;
  if (!isUuid(id) || !isUuid(fileId)) notFound();
  const [row] = await db
    .select({ file: schema.files, title: schema.contents.title })
    .from(schema.files)
    .innerJoin(schema.contents, eq(schema.contents.id, schema.files.contentId))
    .where(and(eq(schema.files.id, fileId), eq(schema.files.contentId, id)));
  if (!row || !row.file.mime.startsWith("video/")) notFound();
  const file = row.file;

  const [[transcript], jobs, src] = await Promise.all([
    db.select().from(schema.transcripts).where(eq(schema.transcripts.fileId, fileId)),
    db
      .select({ job: schema.videoJobs, outputName: schema.files.name })
      .from(schema.videoJobs)
      .leftJoin(schema.files, eq(schema.files.id, schema.videoJobs.outputFileId))
      .where(eq(schema.videoJobs.fileId, fileId))
      .orderBy(desc(schema.videoJobs.createdAt))
      .limit(20),
    presignView(file.key),
  ]);
  const open = (kind: string) => jobs.some(({ job }) => job.kind === kind && (job.status === "queued" || job.status === "running"));
  const active = jobs.some(({ job }) => job.status === "queued" || job.status === "running");
  const transcribing = open("transcribe");
  const ai = aiConfigured();
  const vttVersion = transcript?.updatedAt.getTime() ?? 0;

  return (
    <>
      <JobWatcher active={active} />
      <PageHeader
        title="استودیوی ویدیو"
        description={`${row.title} · ${file.name}`}
        actions={
          <Link href={`/content/${id}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-muted">
            <ArrowRight className="size-4" />
            برگشت به محتوا
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] [&>*]:min-w-0">
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="p-3">
            {/* The edited subtitles play on top, so the team can check timing before burning them in */}
            <video id={PLAYER_ID} src={src} controls playsInline preload="metadata" className="max-h-[70vh] w-full rounded-2xl bg-black">
              {transcript && <track key={vttVersion} kind="subtitles" srcLang="fa" label="فارسی" src={`/files/${fileId}/subtitles?format=vtt&v=${vttVersion}`} default />}
            </video>
          </Card>
          {jobs.length > 0 && (
            <Card className="space-y-2">
              <h2 className="text-sm font-semibold">کارهای پردازش</h2>
              <ul className="space-y-2 text-xs" data-testid="video-jobs">
                {jobs.map(({ job, outputName }) => (
                  <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      {VIDEO_JOB_LABELS[job.kind]}
                      {job.kind === "clip" && typeof job.options.title === "string" && <>: {job.options.title}</>}
                      <span className="block text-muted-foreground">
                        {formatJalaliDateTime(job.createdAt)}
                        {job.error && job.status === "failed" && <span className="text-danger"> · {job.error}</span>}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {job.status === "done" && job.outputContentId && (
                        <Link href={`/content/${job.outputContentId}`} className="text-primary hover:underline">محتوای تازه</Link>
                      )}
                      {job.status === "done" && job.outputFileId && !job.outputContentId && (
                        <Link href={`/files/${job.outputFileId}/download`} prefetch={false} className="text-primary hover:underline" title={outputName ?? ""}>دانلود</Link>
                      )}
                      {job.status === "failed" && (
                        <ActionButton action={retryJob.bind(null, job.id)} pendingLabel="…" variant="ghost" className="h-7 px-2 text-xs">
                          <RotateCcw className="size-3.5" />
                          تکرار
                        </ActionButton>
                      )}
                      <Badge tone={JOB_STATUS_TONES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">۱. زیرنویس</h2>
              {transcript && (
                <span className="flex items-center gap-3 text-xs">
                  <a href={`/files/${fileId}/subtitles`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Download className="size-3.5" />
                    فایل SRT
                  </a>
                  <span className="text-muted-foreground">{toPersianDigits(transcript.segments.length)} خط</span>
                </span>
              )}
            </div>
            {transcribing ? (
              <p className="animate-pulse text-sm text-muted-foreground">در حال تبدیل گفتار به متن… این صفحه خودش به‌روز می‌شود.</p>
            ) : transcript ? (
              <>
                <p className="text-xs text-muted-foreground">روی زمان هر خط بزنید تا ویدیو از همان‌جا پخش شود. متن و زمان‌ها را اصلاح کنید و ذخیره بزنید.</p>
                <TranscriptEditor key={vttVersion} fileId={fileId} segments={transcript.segments} />
              </>
            ) : (
              <EmptyState>
                <p className="mb-3">گفتار این ویدیو به متن فارسی تبدیل می‌شود و بعد می‌توانید اصلاحش کنید.</p>
                {transcribeConfigured() ? (
                  <ActionButton action={startTranscribe.bind(null, fileId)} pendingLabel="در حال ثبت…" variant="primary">
                    <Wand2 className="size-4" />
                    ساختن زیرنویس خودکار
                  </ActionButton>
                ) : (
                  <Badge tone="warning">سرویس Whisper هنوز روی سرور تنظیم نشده است</Badge>
                )}
              </EmptyState>
            )}
            {transcript && !transcribing && transcribeConfigured() && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">ساختن دوباره از اول</summary>
                <div className="mt-2">
                  <ActionButton action={startTranscribe.bind(null, fileId)} pendingLabel="در حال ثبت…" variant="ghost" className="h-8 px-3 text-xs">
                    زیرنویس تازه (اصلاحات فعلی پاک می‌شود)
                  </ActionButton>
                </div>
              </details>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">۲. نسخه زیرنویس‌دار</h2>
            <p className="text-xs text-muted-foreground">زیرنویس با فونت وزیرمتن روی خود ویدیو نوشته می‌شود و به‌عنوان نسخه تدوین تازه به همین محتوا اضافه می‌شود.</p>
            <BurnForm action={startBurn.bind(null, fileId)} disabled={!transcript || transcribing || open("burn")} />
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">۳. کلیپ‌ساز خودکار</h2>
              {transcript && ai && (
                <ActionButton action={findClips.bind(null, fileId)} pendingLabel="در حال پیدا کردن…" variant={transcript.clipIdeas?.length ? "ghost" : "primary"}>
                  <Sparkles className="size-4" />
                  {transcript.clipIdeas ? "پیدا کردن دوباره" : "پیدا کردن لحظه‌های جذاب"}
                </ActionButton>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              هوش مصنوعی از روی متن ویدیو بهترین لحظه‌ها را برای ریلز پیدا می‌کند. هر کلیپ عمودی ۹:۱۶ بریده می‌شود و یک محتوای تازه در مرحله تدوین می‌سازد.
            </p>
            {!transcript && <p className="text-sm text-muted-foreground">اول زیرنویس را بسازید.</p>}
            {transcript && !ai && <Badge tone="warning">کلید API هوش مصنوعی تنظیم نشده است</Badge>}
            {transcript?.clipIdeas?.length === 0 && <p className="text-sm text-muted-foreground">لحظه مناسبی پیدا نشد.</p>}
            {!!transcript?.clipIdeas?.length && (
              <ul className="grid gap-3 xl:grid-cols-2" data-testid="clip-ideas">
                {transcript.clipIdeas.map((idea, i) => (
                  <li key={`${idea.start}-${idea.end}`} className="space-y-2 rounded-2xl border border-border bg-muted/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <PreviewButton start={idea.start} end={idea.end} />
                      <Badge tone={idea.score >= 8 ? "success" : idea.score >= 6 ? "info" : "neutral"}>امتیاز {toPersianDigits(idea.score)} از ۱۰</Badge>
                    </div>
                    <p className="text-sm font-medium">«{idea.hook}»</p>
                    <p className="text-xs text-muted-foreground">{idea.reason}</p>
                    <ClipForm action={cutClip.bind(null, fileId)} idea={idea} index={i} hasTranscript />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
