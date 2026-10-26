import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { notifyClient, notifyTeam } from "@/lib/notify";
import { authed, body, idParam } from "@/lib/api/http";
import { visibleContent } from "@/lib/api/contents";

const commentSchema = z.object({
  body: z.string().trim().min(1, { error: "متن نظر را بنویسید" }).max(4000),
  timecode: z.number().int().min(0).max(36_000).nullable().optional(),
  internal: z.boolean().optional(),
});

// Team comments reach the client unless internal; client comments reach the team
export const POST = authed<RouteContext<"/api/v1/contents/[id]/comments">>(async (user, request, ctx) => {
  const content = await visibleContent(user, idParam((await ctx.params).id));
  const input = await body(request, commentSchema);
  const client = user.role === "client";
  const internal = !client && !!input.internal;
  const [comment] = await db
    .insert(schema.contentComments)
    .values({ contentId: content.id, userId: user.id, body: input.body, timecode: input.timecode ?? null, internal })
    .returning();
  if (client) {
    await notifyTeam({ title: `پیام مشتری روی «${content.title}»`, body: input.body, href: `/content/${content.id}` }, [content.assigneeId]);
    revalidatePath(`/portal/content/${content.id}`);
  } else if (!internal) {
    await notifyClient(content.clientId, { title: `نظر جدید روی «${content.title}»`, body: input.body, href: `/portal/content/${content.id}` });
  }
  revalidatePath(`/content/${content.id}`);
  return Response.json({ data: comment }, { status: 201 });
});
