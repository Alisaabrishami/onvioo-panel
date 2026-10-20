import { and, count, eq, gt } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { activeUserByPhone, deviceField, login, phoneField } from "@/lib/api/auth";
import { ApiError, body, open } from "@/lib/api/http";

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60_000;

// An app can retry passwords far faster than a person, so failures per phone are capped
async function tooManyFailures(phone: string): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, "login_failed"), eq(schema.auditLog.entityId, phone), gt(schema.auditLog.createdAt, new Date(Date.now() - WINDOW_MS))));
  return row.value >= MAX_FAILURES;
}

export const POST = open(async (request) => {
  const input = await body(request, z.object({ phone: phoneField, password: z.string({ error: "رمز عبور را وارد کنید" }).min(1, { error: "رمز عبور را وارد کنید" }), device: deviceField }));
  if (await tooManyFailures(input.phone)) throw new ApiError(429, "too_many", "تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه بعد دوباره امتحان کنید");
  const user = await activeUserByPhone(input.phone);
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, input.password))) {
    await audit(user?.id ?? null, "login_failed", "phone", input.phone, { via: "api" });
    throw new ApiError(401, "bad_password", "شماره یا رمز عبور اشتباه است");
  }
  return login(user, input.device, "password");
});
