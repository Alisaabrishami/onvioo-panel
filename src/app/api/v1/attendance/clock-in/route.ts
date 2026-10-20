import { eq } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import { ApiError, TEAM, authed, body, uuid } from "@/lib/api/http";
import { clockIn } from "@/lib/team-ops";

// Starts work, or switches client when already clocked in
export const POST = authed(async (user, request) => {
  const { clientId } = await body(request, z.object({ clientId: uuid.nullable().optional() }));
  if (clientId) {
    const [client] = await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, clientId));
    if (!client) throw new ApiError(422, "invalid", "مشتری پیدا نشد");
  }
  return clockIn(user.id, clientId ?? null);
}, TEAM);
