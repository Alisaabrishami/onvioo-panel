import "server-only";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { normalizePhone } from "@/lib/format";
import { type ApiUser, issueToken } from "./http";

export const phoneField = z.string({ error: "شماره موبایل را بفرستید" }).transform((v, ctx) => {
  const phone = normalizePhone(v);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: "شماره موبایل معتبر نیست" });
    return z.NEVER;
  }
  return phone;
});

export const deviceField = z.string().trim().max(80).optional();

export async function activeUserByPhone(phone: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  return user && user.active ? user : null;
}

export async function profile(user: Pick<ApiUser, "id" | "name" | "phone" | "role" | "clientId">) {
  const [client] = user.clientId ? await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, user.clientId)) : [];
  return { id: user.id, name: user.name, phone: user.phone, role: user.role, clientId: user.clientId, clientName: client?.name ?? null };
}

export async function login(user: typeof schema.users.$inferSelect, device: string | undefined, method: string) {
  const { token, expiresAt } = await issueToken(user.id, device ?? null);
  await audit(user.id, "login", "user", user.id, { method, via: "api", device });
  return { token, expiresAt, user: await profile(user) };
}
