import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed } from "@/lib/api/http";

// Ends this token only; other devices stay signed in
export const POST = authed(async (user) => {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, user.tokenHash));
  return { ok: true };
});
