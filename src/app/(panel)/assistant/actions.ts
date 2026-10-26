"use server";

import * as z from "zod";
import { AiUnavailableError } from "@/lib/ai";
import { askAssistant } from "@/lib/assistant";
import { requireTeam } from "@/lib/auth/dal";

const historySchema = z
  .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(4000) }))
  .min(1)
  .max(30)
  .refine((h) => h.at(-1)?.role === "user");

export type ChatReply = { ok: true; text: string } | { ok: false; error: string };

export async function sendChat(history: unknown): Promise<ChatReply> {
  const user = await requireTeam();
  const parsed = historySchema.safeParse(history);
  if (!parsed.success) return { ok: false, error: "پیام نامعتبر است." };
  // Only the last turns go to Claude, to keep requests small
  const turns = parsed.data.slice(-12);
  while (turns[0]?.role !== "user") turns.shift();
  try {
    return { ok: true, text: await askAssistant(turns, { id: user.id, role: user.role, name: user.name }) };
  } catch (error) {
    if (error instanceof AiUnavailableError) return { ok: false, error: "دستیار هنوز فعال نیست؛ کلید API هوش مصنوعی تنظیم نشده." };
    console.error("assistant failed", error);
    return { ok: false, error: "پاسخ گرفتن از دستیار ممکن نشد. دوباره امتحان کنید." };
  }
}
