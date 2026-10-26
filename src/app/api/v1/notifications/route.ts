import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, page, query } from "@/lib/api/http";
import { unreadCount } from "@/lib/notifications";

// ?unread=1 for unread only; href is a panel path the app can map to a screen
export const GET = authed(async (user, request) => {
  const { limit, offset } = page(request);
  const unreadOnly = query(request).get("unread") === "1";
  const items = await db
    .select({ id: schema.notifications.id, title: schema.notifications.title, body: schema.notifications.body, href: schema.notifications.href, readAt: schema.notifications.readAt, createdAt: schema.notifications.createdAt })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), unreadOnly ? isNull(schema.notifications.readAt) : undefined))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
    .offset(offset);
  return { items, unread: await unreadCount(user.id) };
});
