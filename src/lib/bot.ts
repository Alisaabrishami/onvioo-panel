import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ChatPlatform } from "@/db/schema";

// Bale's bot API mirrors Telegram's and is reachable from servers in Iran,
// so one client serves both
export const PLATFORMS = {
  bale: { label: "بله", base: "https://tapi.bale.ai", token: "BALE_BOT_TOKEN", chat: "BALE_CHAT_ID", link: "https://ble.ir" },
  telegram: { label: "تلگرام", base: "https://api.telegram.org", token: "TELEGRAM_BOT_TOKEN", chat: "TELEGRAM_CHAT_ID", link: "https://t.me" },
} as const satisfies Record<ChatPlatform, { label: string; base: string; token: string; chat: string; link: string }>;

export const PLATFORM_KEYS = Object.keys(PLATFORMS) as ChatPlatform[];

export type InlineButton = { text: string; data: string } | { text: string; url: string };
export type ChatMessage = { text: string; buttons?: InlineButton[][]; menu?: string[][] };

export class BotApiError extends Error {}

export function botConfigured(platform: ChatPlatform): boolean {
  return !!process.env[PLATFORMS[platform].token];
}

export function teamChatId(platform: ChatPlatform): string | null {
  return botConfigured(platform) ? (process.env[PLATFORMS[platform].chat] ?? null) : null;
}

function devMode() {
  return process.env.BOT_DRIVER === "log" || process.env.NOTIFY_DRIVER === "log";
}

export async function botApi<T = unknown>(platform: ChatPlatform, method: string, body: Record<string, unknown> = {}): Promise<T> {
  if (devMode()) {
    console.info(`[bot:${platform}] ${method} ${JSON.stringify(body)}`);
    return { message_id: 1, username: `onvioo_${platform}_bot` } as T;
  }
  const token = process.env[PLATFORMS[platform].token];
  if (!token) throw new BotApiError(`${platform} bot token is not set`);
  const res = await fetch(`${PLATFORMS[platform].base}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !json?.ok) throw new BotApiError(json?.description ?? `${platform} responded ${res.status}`);
  return json.result as T;
}

function replyMarkup(message: ChatMessage) {
  if (message.buttons?.length) {
    return {
      inline_keyboard: message.buttons.map((row) =>
        row.map((b) => ("url" in b ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data })),
      ),
    };
  }
  if (message.menu) return { keyboard: message.menu.map((row) => row.map((text) => ({ text }))), resize_keyboard: true };
  return undefined;
}

export async function sendChat(platform: ChatPlatform, chatId: string, message: ChatMessage): Promise<void> {
  await botApi(platform, "sendMessage", { chat_id: chatId, text: message.text, reply_markup: replyMarkup(message) });
}

export async function editChat(platform: ChatPlatform, chatId: string, messageId: number, message: ChatMessage): Promise<void> {
  await botApi(platform, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: message.text,
    reply_markup: replyMarkup(message) ?? { inline_keyboard: [] },
  });
}

// Telegram only accepts public http(s) addresses on URL buttons
export function linkButton(text: string, url: string | null | undefined): InlineButton[] {
  return url && /^https:\/\//.test(url) ? [{ text, url }] : [];
}

export function appLink(href: string | null | undefined): string | null {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return base && href ? `${base}${href}` : null;
}

// Sends to every connected chat of these people; one failing chat never stops the rest
export async function sendToUsers(userIds: string[], message: ChatMessage): Promise<void> {
  if (userIds.length === 0) return;
  const links = await db
    .select({ platform: schema.chatLinks.platform, chatId: schema.chatLinks.chatId })
    .from(schema.chatLinks)
    .where(inArray(schema.chatLinks.userId, userIds));
  await Promise.all(
    links
      .filter((l) => botConfigured(l.platform) || devMode())
      .map(async (l) => {
        try {
          await sendChat(l.platform, l.chatId, message);
        } catch (error) {
          console.error(`[bot] ${l.platform} send failed`, error);
        }
      }),
  );
}

// --- Connecting a login to a chat ----------------------------------------

// No 0/O or 1/I, so the code survives being read aloud or typed by hand
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_MINUTES = 15;

export async function createLinkCode(userId: string): Promise<string> {
  const code = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  await db.delete(schema.chatLinkCodes).where(lt(schema.chatLinkCodes.expiresAt, new Date()));
  await db.delete(schema.chatLinkCodes).where(eq(schema.chatLinkCodes.userId, userId));
  await db.insert(schema.chatLinkCodes).values({ code, userId, expiresAt: new Date(Date.now() + LINK_CODE_MINUTES * 60_000) });
  return code;
}

// Uses up the code and points this chat at its owner, replacing any older link
export async function redeemLinkCode(platform: ChatPlatform, chatId: string, username: string | null, code: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(schema.chatLinkCodes)
      .where(and(eq(schema.chatLinkCodes.code, code), gt(schema.chatLinkCodes.expiresAt, new Date())))
      .returning();
    if (!row) return null;
    await tx.delete(schema.chatLinks).where(and(eq(schema.chatLinks.platform, platform), eq(schema.chatLinks.chatId, chatId)));
    await tx
      .insert(schema.chatLinks)
      .values({ userId: row.userId, platform, chatId, username })
      .onConflictDoUpdate({
        target: [schema.chatLinks.userId, schema.chatLinks.platform],
        set: { chatId, username, pending: null, createdAt: new Date() },
      });
    return row.userId;
  });
}

// The bot's @username, for deep links; cached per process
const usernames = new Map<ChatPlatform, string>();
export async function botUsername(platform: ChatPlatform): Promise<string | null> {
  const fromEnv = process.env[`${platform.toUpperCase()}_BOT_USERNAME`];
  if (fromEnv) return fromEnv.replace(/^@/, "");
  if (usernames.has(platform)) return usernames.get(platform)!;
  if (!botConfigured(platform) && !devMode()) return null;
  try {
    const me = await botApi<{ username?: string }>(platform, "getMe");
    if (me.username) usernames.set(platform, me.username);
    return me.username ?? null;
  } catch (error) {
    console.error(`[bot] ${platform} getMe failed`, error);
    return null;
  }
}

export function deepLink(platform: ChatPlatform, username: string, code: string): string {
  return `${PLATFORMS[platform].link}/${username}?start=${code}`;
}

export function webhookUrl(platform: ChatPlatform): string | null {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  return secret ? appLink(`/api/bot/${platform}?secret=${encodeURIComponent(secret)}`) : null;
}
