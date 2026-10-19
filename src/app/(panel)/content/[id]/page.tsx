import { asc, desc, eq } from "drizzle-orm";
import { Download, FileVideo, File as FileIcon, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { STAGE_LABELS, STAGE_TONES, TYPE_LABELS, formatTimecode } from "@/lib/content";
import { clientOptions, isUuid, shootOptions, teamOptions } from "@/lib/data";
import { formatBytes, formatJalaliDateTime, jalaliInputValue, toPersianDigits } from "@/lib/format";
import { storageConfigured } from "@/lib/storage";
import { CommentForm } from "@/components/comment-form";
import { Uploader } from "../../files/uploader";
import { addComment, deleteContent, updateContent } from "../actions";
import { ContentForm } from "../content-form";
import { StagePicker } from "./stage-picker";

export const metadata: Metadata = { title: "محتوا" };

const KIND_LABELS = { raw: "خام", edit: "تدوین", cover: "کاور", other: "سایر" } as const;

export default async function ContentDetailPage(props: PageProps<"/content/[id]">) {
  const user = await requireTeam();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();

  const [content] = await db
    .select({ content: schema.contents, clientName: schema.clients.name })
    .from(schema.contents)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.contents.clientId))
    .where(eq(schema.contents.id, id));
  if (!content) notFound();
  const c = content.content;

  const [files, comments, events, clients, team, shoots] = await Promise.all([
    db
      .select({
        id: schema.files.id,
        name: schema.files.name,
        size: schema.files.size,
        mime: schema.files.mime,
        kind: schema.files.kind,
        version: schema.files.version,
        createdAt: schema.files.createdAt,
        uploader: schema.users.name,
      })
      .from(schema.files)
      .leftJoin(schema.users, eq(schema.users.id, schema.files.uploadedBy))
      .where(eq(schema.files.contentId, id))
      .orderBy(desc(schema.files.createdAt)),
    db
      .select({
        id: schema.contentComments.id,
        body: schema.contentComments.body,
        timecode: schema.contentComments.timecode,
        internal: schema.contentComments.internal,
        createdAt: schema.contentComments.createdAt,
        author: schema.users.name,
        role: schema.users.role,
      })
      .from(schema.contentComments)
      .leftJoin(schema.users, eq(schema.users.id, schema.contentComments.userId))
      .where(eq(schema.contentComments.contentId, id))
      .orderBy(asc(schema.contentComments.createdAt)),
    db
      .select({
        id: schema.contentEvents.id,
        fromStage: schema.contentEvents.fromStage,
        toStage: schema.contentEvents.toStage,
        createdAt: schema.contentEvents.createdAt,
        user: schema.users.name,
      })
      .from(schema.contentEvents)
      .leftJoin(schema.users, eq(schema.users.id, schema.contentEvents.userId))
      .where(eq(schema.contentEvents.contentId, id))
      .orderBy(desc(schema.contentEvents.createdAt)),
    clientOptions(),
    teamOptions(),
    shootOptions(c.shootId),
  ]);

  const due = jalaliInputValue(c.dueAt);
  const publish = jalaliInputValue(c.publishAt);

  return (
    <>
      <PageHeader
        title={c.title}
        description={`${content.clientName} · ${TYPE_LABELS[c.type]}`}
        actions={<Badge tone={STAGE_TONES[c.stage]}>{STAGE_LABELS[c.stage]}</Badge>}
      />
      <div className="mb-6">
        <StagePicker contentId={c.id} stage={c.stage} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">جزئیات</h2>
            <ContentForm
              action={updateContent.bind(null, c.id)}
              clients={clients}
              team={team}
              shoots={shoots}
              initial={{
                title: c.title,
                clientId: c.clientId,
                type: c.type,
                assigneeId: c.assigneeId ?? "",
                shootId: c.shootId ?? "",
                dueAt: due.date,
                dueAtTime: due.time === "00:00" ? "" : due.time,
                publishAt: publish.date,
                publishAtTime: publish.time === "00:00" ? "" : publish.time,
                caption: c.caption ?? "",
                hashtags: c.hashtags ?? "",
                notes: c.notes ?? "",
              }}
              submitLabel="ذخیره تغییرات"
            />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">فایل‌ها و نسخه‌ها</h2>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">هنوز فایلی برای این محتوا آپلود نشده است.</p>
            ) : (
              <ul className="divide-y divide-border">
                {files.map((f) => {
                  const Icon = f.mime.startsWith("video/") ? FileVideo : FileIcon;
                  return (
                    <li key={f.id} className="flex items-center gap-3 py-3">
                      <Icon className="size-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          <Badge tone={f.kind === "edit" ? "primary" : "neutral"}>
                            {KIND_LABELS[f.kind]}
                            {f.version && ` v${toPersianDigits(f.version)}`}
                          </Badge>
                          <span className="truncate">{f.name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(f.size)} · {formatJalaliDateTime(f.createdAt)}
                          {f.uploader && ` · ${f.uploader}`}
                        </p>
                      </div>
                      <Link href={`/files/${f.id}/download`} prefetch={false} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary" title="دانلود">
                        <Download className="size-4" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {storageConfigured() && (
              <div className="mt-4 border-t border-border pt-4">
                <Uploader fixedClientId={c.clientId} contentId={c.id} />
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">نظرها و اصلاحیه‌ها</h2>
            {comments.length > 0 && (
              <ul className="mb-4 space-y-3">
                {comments.map((m) => (
                  <li key={m.id} className="rounded-lg bg-muted/60 p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {m.author ?? "کاربر حذف‌شده"}
                        {m.role === "client" && <Badge tone="primary" className="mr-1">مشتری</Badge>}
                        {m.internal && <Badge className="mr-1">داخلی</Badge>}
                      </span>
                      <span>{formatJalaliDateTime(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-line leading-6">
                      {m.timecode !== null && (
                        <span className="ltr ml-1 inline-block rounded bg-primary/15 px-1.5 text-xs font-medium text-primary">
                          {formatTimecode(m.timecode)}
                        </span>
                      )}
                      {m.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <CommentForm action={addComment.bind(null, c.id)} allowInternal />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">تاریخچه مراحل</h2>
            <ol className="space-y-2 text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="flex justify-between gap-2">
                  <span>
                    {ev.fromStage ? `${STAGE_LABELS[ev.fromStage]} ← ` : "ثبت در "}
                    <span className="font-medium">{STAGE_LABELS[ev.toStage]}</span>
                    {ev.user && <span className="text-muted-foreground"> · {ev.user}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatJalaliDateTime(ev.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Card>
          {user.role === "admin" && (
            <form action={deleteContent.bind(null, c.id)}>
              <button type="submit" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-danger">
                <Trash2 className="size-4" />
                حذف این محتوا
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
