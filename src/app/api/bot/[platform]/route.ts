import { createHash, timingSafeEqual } from "node:crypto";
import { PLATFORM_KEYS } from "@/lib/bot";
import { handleUpdate, type Update } from "@/lib/bot-handler";
import type { ChatPlatform } from "@/db/schema";

function secretMatches(given: string | null): boolean {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!secret || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

// Bale and Telegram post every message and button press here. The secret
// rides in the URL because Bale has no secret-token header.
export async function POST(request: Request, ctx: RouteContext<"/api/bot/[platform]">) {
  const { platform } = await ctx.params;
  if (!PLATFORM_KEYS.includes(platform as ChatPlatform)) return new Response(null, { status: 404 });
  if (!secretMatches(new URL(request.url).searchParams.get("secret"))) return new Response(null, { status: 401 });
  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return new Response(null, { status: 400 });
  try {
    await handleUpdate(platform as ChatPlatform, update);
  } catch (error) {
    // Still 200: a failing update retried forever would block the ones after it
    console.error(`[bot] ${platform} update failed`, error);
  }
  return Response.json({ ok: true });
}
