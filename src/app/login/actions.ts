"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requestOtp, verifyOtp } from "@/lib/auth/otp";
import { verifyPassword } from "@/lib/auth/password";
import { homeFor } from "@/lib/auth/roles";
import { createSession, deleteSession } from "@/lib/auth/session";
import { normalizePhone, toLatinDigits } from "@/lib/format";

export type LoginState = {
  error?: string;
  step?: "phone" | "code";
  phone?: string;
  message?: string;
};

const phoneSchema = z
  .string()
  .transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "شماره موبایل معتبر نیست" });
      return z.NEVER;
    }
    return phone;
  });

async function findActiveUser(phone: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, phone))
    .limit(1);
  return user && user.active ? user : null;
}

export async function loginWithPassword(_: LoginState, formData: FormData): Promise<LoginState> {
  const phone = phoneSchema.safeParse(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const typed = String(formData.get("phone") ?? "");
  if (!phone.success) return { phone: typed, error: phone.error.issues[0].message };
  if (!password) return { phone: typed, error: "رمز عبور را وارد کنید" };

  const user = await findActiveUser(phone.data);
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    return { phone: typed, error: "شماره یا رمز عبور اشتباه است" };
  }
  await createSession(user.id);
  await audit(user.id, "login", "user", user.id, { method: "password" });
  redirect(homeFor(user.role));
}

export async function sendLoginCode(_: LoginState, formData: FormData): Promise<LoginState> {
  const phone = phoneSchema.safeParse(formData.get("phone") ?? "");
  if (!phone.success) {
    return { step: "phone", phone: String(formData.get("phone") ?? ""), error: phone.error.issues[0].message };
  }

  let result: Awaited<ReturnType<typeof requestOtp>>;
  try {
    result = await requestOtp(phone.data);
  } catch (error) {
    console.error("OTP request failed", error);
    return { step: "phone", phone: phone.data, error: "ارسال پیامک ناموفق بود؛ دوباره امتحان کنید" };
  }
  if (!result.ok) {
    return {
      step: result.error === "too_soon" ? "code" : "phone",
      phone: phone.data,
      error:
        result.error === "too_soon"
          ? "کد قبلی هنوز معتبر است؛ یک دقیقه بعد دوباره امتحان کنید"
          : "تعداد درخواست‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید",
    };
  }
  return {
    step: "code",
    phone: phone.data,
    message: "اگر این شماره در پنل ثبت شده باشد، کد ورود پیامک شد",
  };
}

export async function verifyLoginCode(_: LoginState, formData: FormData): Promise<LoginState> {
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const code = toLatinDigits(String(formData.get("code") ?? "")).trim();
  if (!phone) return { step: "phone", error: "شماره موبایل معتبر نیست" };
  if (!/^\d{6}$/.test(code)) return { step: "code", phone, error: "کد ۶ رقمی را وارد کنید" };

  const user = await findActiveUser(phone);
  if (!user || !(await verifyOtp(phone, code))) {
    return { step: "code", phone, error: "کد اشتباه یا منقضی شده است" };
  }
  await createSession(user.id);
  await audit(user.id, "login", "user", user.id, { method: "otp" });
  redirect(homeFor(user.role));
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
