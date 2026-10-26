import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Scheduled jobs call /api/cron/* with "Authorization: Bearer $CRON_SECRET"
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
