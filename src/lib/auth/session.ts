import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db, schema } from "@/db";
import { generateSessionToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "onvioo_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const requestHeaders = await headers();
  await db.insert(schema.sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 300) ?? null,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure only over HTTPS (Caddy sets X-Forwarded-Proto); browsers drop Secure cookies on plain http://IP
    secure: requestHeaders.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  role: (typeof schema.roleEnum.enumValues)[number];
  clientId: string | null;
};

export async function readSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      phone: schema.users.phone,
      role: schema.users.role,
      clientId: schema.users.clientId,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(
      and(
        eq(schema.sessions.id, hashToken(token)),
        gt(schema.sessions.expiresAt, new Date()),
        eq(schema.users.active, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

// Signs a user out everywhere, e.g. after deactivation or a password change
export async function deleteUserSessions(userId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

// The hash of this browser's session, to mark it in the list of devices
export async function currentSessionHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}
