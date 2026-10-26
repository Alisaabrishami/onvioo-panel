import { and, eq, inArray, isNull } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import { authed, body, uuid } from "@/lib/api/http";

// Marks the given notifications read, or all of them without ids
export const POST = authed(async (user, request) => {
  const { ids } = await body(request, z.object({ ids: z.array(uuid).max(200).optional() }));
  const marked = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt), ids ? inArray(schema.notifications.id, ids) : undefined))
    .returning({ id: schema.notifications.id });
  return { marked: marked.length };
});
