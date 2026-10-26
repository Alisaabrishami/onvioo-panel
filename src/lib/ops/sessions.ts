import "server-only";
import { and, desc, eq, gt, like, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { describeAgent } from "@/lib/devices";
import { missing } from "./errors";

// Signed-in browsers and app tokens of one account. A session is shown by the
// first 16 characters of its token hash, enough to tell them apart without
// putting the whole key in URLs.
export const sessionRef = (hash: string) => hash.slice(0, 16);

export async function listSessions(userId: string, currentHash?: string | null) {
  const rows = await db
    .select({ id: schema.sessions.id, device: schema.sessions.device, userAgent: schema.sessions.userAgent, createdAt: schema.sessions.createdAt, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.createdAt));
  return rows.map((s) => ({
    id: sessionRef(s.id),
    kind: s.device ? ("app" as const) : ("browser" as const),
    device: s.device ?? "مرورگر",
    detail: describeAgent(s.userAgent),
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    current: s.id === currentHash,
  }));
}

export async function revokeSession(userId: string, ref: string) {
  if (!/^[0-9a-f]{16}$/.test(ref)) throw missing();
  const deleted = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), like(schema.sessions.id, `${ref}%`)))
    .returning({ id: schema.sessions.id });
  if (deleted.length === 0) throw missing();
  await audit(userId, "revoke", "session", ref);
}

// "Sign out everywhere else": every session but the one in use
export async function revokeOtherSessions(userId: string, keepHash: string | null) {
  const deleted = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.userId, userId), keepHash ? ne(schema.sessions.id, keepHash) : undefined))
    .returning({ id: schema.sessions.id });
  if (deleted.length) await audit(userId, "revoke_others", "session", undefined, { count: deleted.length });
  return deleted.length;
}
