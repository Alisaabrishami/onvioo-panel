import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { STAGE_LABELS, TYPE_LABELS } from "@/lib/content";
import { ApiError, authed, page, query, uuidParam, clientOf } from "@/lib/api/http";

// Team: every item, ?stage= ?clientId= ?mine=1. Client: their own started items, ?stage=client_review for the approval queue
export const GET = authed(async (user, request) => {
  const q = query(request);
  const { limit, offset } = page(request);
  const clientId = uuidParam(request, "clientId");
  const stage = q.get("stage");
  if (stage && !schema.contentStageEnum.enumValues.includes(stage as never)) throw new ApiError(422, "invalid", "مرحله معتبر نیست");
  const client = user.role === "client";
  const items = await db
    .select({
      id: schema.contents.id,
      title: schema.contents.title,
      type: schema.contents.type,
      stage: schema.contents.stage,
      clientId: schema.contents.clientId,
      clientName: schema.clients.name,
      assigneeId: schema.contents.assigneeId,
      dueAt: schema.contents.dueAt,
      publishAt: schema.contents.publishAt,
      updatedAt: schema.contents.updatedAt,
    })
    .from(schema.contents)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.contents.clientId))
    .where(
      and(
        client ? and(eq(schema.contents.clientId, clientOf(user)), ne(schema.contents.stage, "idea")) : undefined,
        stage ? eq(schema.contents.stage, stage as (typeof schema.contentStageEnum.enumValues)[number]) : undefined,
        !client && clientId ? eq(schema.contents.clientId, clientId) : undefined,
        !client && q.get("mine") === "1" ? eq(schema.contents.assigneeId, user.id) : undefined,
      ),
    )
    .orderBy(desc(schema.contents.updatedAt))
    .limit(limit)
    .offset(offset);
  return { items: items.map((c) => ({ ...c, typeLabel: TYPE_LABELS[c.type], stageLabel: STAGE_LABELS[c.stage] })) };
});
