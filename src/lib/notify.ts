import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/db";
import { type InlineButton, PLATFORM_KEYS, appLink, linkButton, sendChat, sendToUsers, teamChatId } from "./bot";
import { sendNotifySms } from "./sms";

// buttons only show in Bale/Telegram, e.g. approve / ask for changes
export type Notice = { title: string; body?: string; href?: string; buttons?: InlineButton[][] };

// In-app notifications for specific people, copied to their Bale/Telegram
// chats when connected. Duplicate and null ids are dropped, and the person
// who caused the event is skipped.
export async function notifyUsers(
  userIds: (string | null | undefined)[],
  notice: Notice,
  exceptUserId?: string,
  opts: { chat?: boolean } = {},
): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id && id !== exceptUserId))];
  if (ids.length === 0) return;
  const { buttons, ...row } = notice;
  await db.insert(schema.notifications).values(ids.map((userId) => ({ userId, ...row })));
  if (opts.chat !== false) after(() => sendToUsers(ids, chatMessage({ ...row, buttons })));
}

// Admins plus any extra team members involved (an assignee, a project owner),
// and the team's Bale/Telegram group
export async function notifyTeam(notice: Notice, extraUserIds: (string | null)[] = [], exceptUserId?: string) {
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true)));
  // Admins already read the team group, so only the people involved get a private copy
  const group = PLATFORM_KEYS.some((p) => teamChatId(p));
  await notifyUsers(admins.map((a) => a.id), notice, exceptUserId, { chat: !group });
  await notifyUsers(extraUserIds.filter((id) => !admins.some((a) => a.id === id)), notice, exceptUserId);
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

function chatMessage(notice: Notice) {
  const url = appLink(notice.href);
  const open = linkButton("باز کردن در پنل", url);
  return {
    // Without an https address for a button, the link goes in the text
    text: [notice.title, notice.body, open.length ? null : url].filter(Boolean).join("\n"),
    buttons: [...(notice.buttons ?? []), ...(open.length ? [open] : [])],
  };
}

export async function sendToTeamChats(notice: Notice): Promise<void> {
  // Group messages are read-only; approving and the like happen in private chats
  const message = chatMessage({ ...notice, buttons: undefined });
  await Promise.all(
    PLATFORM_KEYS.map(async (platform) => {
      const chatId = teamChatId(platform);
      if (!chatId) return;
      try {
        await sendChat(platform, chatId, message);
      } catch (error) {
        console.error(`[notify] ${platform} failed`, error);
      }
    }),
  );
}
