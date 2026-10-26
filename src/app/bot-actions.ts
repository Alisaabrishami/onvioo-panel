"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ChatPlatform } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { BotApiError, PLATFORMS, PLATFORM_KEYS, botApi, botConfigured, botUsername, createLinkCode, deepLink, teamChatId, webhookUrl } from "@/lib/bot";
import type { FormState } from "@/lib/forms";
import { sendToTeamChats } from "@/lib/notify";

function platformOf(value: unknown): ChatPlatform | null {
  return PLATFORM_KEYS.includes(value as ChatPlatform) ? (value as ChatPlatform) : null;
}

export type LinkStart = { code?: string; url?: string; error?: string };

export async function startChatLink(platform: string): Promise<LinkStart> {
  const user = await requireUser();
  const p = platformOf(platform);
  if (!p || !botConfigured(p)) return { error: "این ربات هنوز روی سرور تنظیم نشده است" };
  const [code, username] = await Promise.all([createLinkCode(user.id), botUsername(p)]);
  return { code, url: username ? deepLink(p, username, code) : undefined };
}

export async function unlinkChat(platform: string): Promise<void> {
  const user = await requireUser();
  const p = platformOf(platform);
  if (!p) return;
  await db.delete(schema.chatLinks).where(and(eq(schema.chatLinks.userId, user.id), eq(schema.chatLinks.platform, p)));
  await audit(user.id, "unlink", "chat", p);
  revalidatePath("/bot");
  revalidatePath("/portal/bot");
}

// Tells Bale/Telegram where to post updates; needed once per server address
export async function registerWebhook(platform: string): Promise<FormState> {
  const admin = await requireAdmin();
  const p = platformOf(platform);
  if (!p || !botConfigured(p)) return { message: "توکن این ربات تنظیم نشده است" };
  const url = webhookUrl(p);
  if (!url || !url.startsWith("https://")) return { message: "برای وب‌هوک، APP_URL باید https باشد و BOT_WEBHOOK_SECRET تنظیم شود" };
  try {
    await botApi(p, "setWebhook", { url, allowed_updates: ["message", "callback_query"] });
  } catch (error) {
    return { message: error instanceof BotApiError ? `خطای ${PLATFORMS[p].label}: ${error.message}` : "ارتباط با سرور ربات برقرار نشد" };
  }
  await audit(admin.id, "webhook", "bot", p);
  return { ok: true, message: "ثبت شد؛ پیام‌ها و دکمه‌ها از این به بعد به پنل می‌رسند" };
}

export async function testTeamChat(): Promise<FormState> {
  await requireAdmin();
  if (!PLATFORM_KEYS.some((p) => teamChatId(p))) return { message: "شناسه گروه تیم (BALE_CHAT_ID یا TELEGRAM_CHAT_ID) تنظیم نشده است" };
  await sendToTeamChats({ title: "پیام آزمایشی پنل انوییو ✅", body: "اعلان‌های تیم در این گروه می‌آیند." });
  return { ok: true, message: "فرستاده شد؛ گروه را نگاه کنید" };
}
