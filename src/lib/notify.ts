import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/db";
import { sendNotifySms } from "./sms";

export type Notice = { title: string; body?: string; href?: string };

// In-app notifications for specific people. Duplicate and null ids are dropped,
// and the person who caused the event is skipped.
export async function notifyUsers(
  userIds: (string | null | undefined)[],
  notice: Notice,
  exceptUserId?: string,
): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== exceptUserId))];
  if (ids.length === 0) return;
  await db.insert(schema.notifications).values(ids.map((userId) => ({ userId, ...notice })));
}

// Admins plus any extra team members involved (an assignee, a project owner),
// and the team's Bale/Telegram group
export async function notifyTeam(notice: Notice, extraUserIds: (string | null)[] = [], exceptUserId?: string) {
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true)));
  await notifyUsers([...admins.map((a) => a.id), ...extraUserIds], notice, exceptUserId);
  after(() => sendToTeamChats(notice));
}

// Every portal login of a client, in the app and by SMS when a template is set
export async function notifyClient(clientId: string, notice: Notice, opts: { sms?: boolean } = {}) {
  const people = await db
    .select({ id: schema.users.id, phone: schema.users.phone })
    .from(schema.users)
    .where(and(eq(schema.users.clientId, clientId), eq(schema.users.role, "client"), eq(schema.users.active, true)));
  await notifyUsers(people.map((p) => p.id), notice);
  if (opts.sms) {
    after(async () => {
      for (const p of people) {
        try {
          await sendNotifySms(p.phone, notice.title);
        } catch (error) {
          console.error("[notify] SMS failed", error);
        }
      }
    });
  }
}

export async function teamMemberIds(ids: (string | null)[]): Promise<string[]> {
  const wanted = ids.filter((id): id is string => !!id);
  if (wanted.length === 0) return [];
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(inArray(schema.users.id, wanted), ne(schema.users.role, "client")));
  return rows.map((r) => r.id);
}

const CHATS = [
  // Bale's bot API mirrors Telegram's and is reachable from servers in Iran
  { name: "bale", base: "https://tapi.bale.ai", token: "BALE_BOT_TOKEN", chat: "BALE_CHAT_ID" },
  { name: "telegram", base: "https://api.telegram.org", token: "TELEGRAM_BOT_TOKEN", chat: "TELEGRAM_CHAT_ID" },
] as const;

function chatText(notice: Notice): string {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return [notice.title, notice.body, base && notice.href ? `${base}${notice.href}` : null].filter(Boolean).join("\n");
}

export async function sendToTeamChats(notice: Notice): Promise<void> {
  const text = chatText(notice);
  if (process.env.NOTIFY_DRIVER === "log") {
    console.info(`[notify:dev] ${text.replace(/\n/g, " | ")}`);
    return;
  }
  await Promise.all(
    CHATS.map(async (c) => {
      const token = process.env[c.token];
      const chatId = process.env[c.chat];
      if (!token || !chatId) return;
      try {
        const res = await fetch(`${c.base}/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) console.error(`[notify] ${c.name} responded ${res.status}`);
      } catch (error) {
        console.error(`[notify] ${c.name} failed`, error);
      }
    }),
  );
}
