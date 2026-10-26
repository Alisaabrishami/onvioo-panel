import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { STAGE_LABELS, TYPE_LABELS } from "@/lib/content";
import { presignDownload, presignView, storageConfigured } from "@/lib/storage";
import { authed, idParam } from "@/lib/api/http";
import { visibleContent } from "@/lib/api/contents";

// One item with its files (short-lived play and download links) and comments
export const GET = authed<RouteContext<"/api/v1/contents/[id]">>(async (user, _request, ctx) => {
  const content = await visibleContent(user, idParam((await ctx.params).id));
  const client = user.role === "client";
  const [files, comments] = await Promise.all([
    db
      .select({ id: schema.files.id, key: schema.files.key, name: schema.files.name, mime: schema.files.mime, size: schema.files.size, kind: schema.files.kind, version: schema.files.version, createdAt: schema.files.createdAt })
      .from(schema.files)
      .where(eq(schema.files.contentId, content.id))
      .orderBy(desc(schema.files.createdAt)),
    db
      .select({ id: schema.contentComments.id, body: schema.contentComments.body, timecode: schema.contentComments.timecode, internal: schema.contentComments.internal, createdAt: schema.contentComments.createdAt, author: schema.users.name, authorRole: schema.users.role })
      .from(schema.contentComments)
      .leftJoin(schema.users, eq(schema.users.id, schema.contentComments.userId))
      .where(and(eq(schema.contentComments.contentId, content.id), client ? eq(schema.contentComments.internal, false) : undefined))
      .orderBy(asc(schema.contentComments.createdAt)),
  ]);
  // Clients see finished edits and covers, not raw footage
  const shown = client ? files.filter((f) => f.kind === "edit" || f.kind === "cover") : files;
  const withLinks = await Promise.all(
    shown.map(async ({ key, ...f }) => ({
      ...f,
      viewUrl: storageConfigured() ? await presignView(key) : null,
      downloadUrl: storageConfigured() ? await presignDownload(key, f.name) : null,
    })),
  );
  const { notes, createdBy, ...rest } = content;
  return {
    ...rest,
    ...(client ? {} : { notes, createdBy }),
    typeLabel: TYPE_LABELS[content.type],
    stageLabel: STAGE_LABELS[content.stage],
    files: withLinks,
    comments,
  };
});
