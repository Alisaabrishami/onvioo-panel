import "server-only";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendOtpSms } from "@/lib/sms";
import { generateOtpCode, hashOtp, safeEqualHex } from "./tokens";

const CODE_TTL_MS = 2 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export type OtpRequestResult = { ok: true } | { ok: false; error: "too_soon" | "too_many" };

export async function requestOtp(phone: string): Promise<OtpRequestResult> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await db
    .select({ createdAt: schema.otpCodes.createdAt })
    .from(schema.otpCodes)
    .where(and(eq(schema.otpCodes.phone, phone), gt(schema.otpCodes.createdAt, hourAgo)))
    .orderBy(desc(schema.otpCodes.createdAt));

  if (recent.length >= MAX_PER_HOUR) return { ok: false, error: "too_many" };
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_AFTER_MS) {
    return { ok: false, error: "too_soon" };
  }

  // Only registered, active users get a code; callers show the same
  // message either way so the form does not reveal who is registered
  const [{ value: known }] = await db
    .select({ value: count() })
    .from(schema.users)
    .where(and(eq(schema.users.phone, phone), eq(schema.users.active, true)));

  const code = generateOtpCode();
  const [row] = await db
    .insert(schema.otpCodes)
    .values({ phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) })
    .returning({ id: schema.otpCodes.id });
  if (known > 0) {
    try {
      await sendOtpSms(phone, code);
    } catch (error) {
      // A code that never arrived must not block the user from retrying
      await db.delete(schema.otpCodes).where(eq(schema.otpCodes.id, row.id));
      throw error;
    }
  }
  return { ok: true };
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const [latest] = await db
    .select()
    .from(schema.otpCodes)
    .where(and(eq(schema.otpCodes.phone, phone), gt(schema.otpCodes.expiresAt, new Date())))
    .orderBy(desc(schema.otpCodes.createdAt))
    .limit(1);
  if (!latest || latest.attempts >= MAX_ATTEMPTS) return false;

  if (!safeEqualHex(latest.codeHash, hashOtp(phone, code))) {
    await db
      .update(schema.otpCodes)
      .set({ attempts: sql`${schema.otpCodes.attempts} + 1` })
      .where(eq(schema.otpCodes.id, latest.id));
    return false;
  }
  await db.delete(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
  return true;
}
