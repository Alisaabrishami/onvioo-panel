import { and, asc, desc, eq, ne } from "drizzle-orm";
import { CalendarClock, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentForm } from "@/components/comment-form";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { TYPE_LABELS, formatTimecode } from "@/lib/content";
import { isUuid } from "@/lib/data";
import { formatJalaliDateTime, formatJalaliLong, formatTime, toPersianDigits } from "@/lib/format";
import { addClientComment, approveContent, requestChanges } from "../actions";
import { CLIENT_STAGE_LABELS, StageProgress } from "../progress";
import { ReviewPanel } from "./review-panel";

export const metadata: Metadata = { title: "محتوا" };

export default async function PortalContentDetail(props: PageProps<"/portal/content/[id]">) {
  const user = await requireClient();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();

  const [content] = await db
    .select()
    .from(schema.contents)
    .where(and(eq(schema.contents.id, id), eq(schema.contents.clientId, user.clientId), ne(schema.contents.stage, "idea")));
  if (!content) notFound();

  const [edits, comments] = await Promise.all([
    db
      .select({ id: schema.files.id, name: schema.files.name, mime: schema.files.mime, version: schema.files.version, createdAt: schema.files.createdAt })
      .from(schema.files)
      .where(and(eq(schema.files.contentId, id), eq(schema.files.kind, "edit")))
      .orderBy(desc(schema.files.version)),
    db
      .select({
        id: schema.contentComments.id,
        body: schema.contentComments.body,
        timecode: schema.contentComments.timecode,
        createdAt: schema.contentComments.createdAt,
        author: schema.users.name,
        role: schema.users.role,
      })
      .from(schema.contentComments)
      .leftJoin(schema.users, eq(schema.users.id, schema.contentComments.userId))
      .where(and(eq(schema.contentComments.contentId, id), eq(schema.contentComments.internal, false)))
      .orderBy(asc(schema.contentComments.createdAt)),
  ]);
  const latest = edits[0];
  const reviewing = content.stage === "client_review";

  return (
    <>
      <PageHeader
        title={content.title}
        description={TYPE_LABELS[content.type]}
        actions={
          <Badge tone={reviewing ? "warning" : content.stage === "published" ? "success" : "neutral"}>
            {CLIENT_STAGE_LABELS[content.stage]}
          </Badge>
        }
      />
      <Card className="mb-6">
        <StageProgress stage={content.stage} />
        {content.publishAt && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="size-4" />
            زمان انتشار: {formatJalaliLong(content.publishAt)} ساعت {formatTime(content.publishAt)}
          </p>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {latest ? (
            <Card className="p-3">
              {latest.mime.startsWith("video/") ? (
                <video src={`/files/${latest.id}/download`} controls playsInline preload="metadata" className="mx-auto max-h-[70vh] w-full rounded-lg bg-black" />
              ) : (
                <p className="p-4 text-sm">{latest.name}</p>
              )}
              <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>
                  نسخه {toPersianDigits(latest.version ?? 1)} · {formatJalaliDateTime(latest.createdAt)}
                </span>
                <Link href={`/files/${latest.id}/download`} prefetch={false} className="flex items-center gap-1 hover:text-primary">
                  <Download className="size-3.5" />
                  دانلود
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="text-sm text-muted-foreground">نسخه تدوین‌شده هنوز آماده نشده است.</Card>
          )}
          {reviewing && (
            <ReviewPanel approve={approveContent.bind(null, content.id)} requestChanges={requestChanges.bind(null, content.id)} />
          )}
          {content.caption && (
            <Card>
              <h2 className="mb-2 font-semibold">کپشن</h2>
              <p className="whitespace-pre-line text-sm leading-7">{content.caption}</p>
              {content.hashtags && <p className="mt-2 text-sm text-primary">{content.hashtags}</p>}
            </Card>
          )}
        </div>
        <Card>
          <h2 className="mb-3 font-semibold">گفتگو</h2>
          {comments.length > 0 && (
            <ul className="mb-4 space-y-3">
              {comments.map((m) => (
                <li key={m.id} className={m.role === "client" ? "rounded-lg bg-primary/10 p-3 text-sm" : "rounded-lg bg-muted/60 p-3 text-sm"}>
                  <div className="mb-1 flex justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{m.role === "client" ? m.author : "تیم Onvioo"}</span>
                    <span>{formatJalaliDateTime(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-line leading-6">
                    {m.timecode !== null && (
                      <span className="ltr ml-1 inline-block rounded bg-primary/15 px-1.5 text-xs font-medium text-primary">{formatTimecode(m.timecode)}</span>
                    )}
                    {m.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <CommentForm action={addClientComment.bind(null, content.id)} placeholder="سؤال یا پیام برای تیم…" submitLabel="ارسال" />
        </Card>
      </div>
    </>
  );
}
