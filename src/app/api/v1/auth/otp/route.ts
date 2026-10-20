import * as z from "zod";
import { requestOtp } from "@/lib/auth/otp";
import { ApiError, body, open } from "@/lib/api/http";
import { phoneField } from "@/lib/api/auth";

// Sends a login code by SMS. The answer is the same for unknown numbers,
// so the API does not reveal who has an account.
export const POST = open(async (request) => {
  const { phone } = await body(request, z.object({ phone: phoneField }));
  const result = await requestOtp(phone).catch((error) => {
    console.error("[api] OTP request failed", error);
    throw new ApiError(502, "sms_failed", "ارسال پیامک ناموفق بود؛ دوباره امتحان کنید");
  });
  if (!result.ok) {
    throw result.error === "too_soon"
      ? new ApiError(429, "too_soon", "کد قبلی هنوز معتبر است؛ یک دقیقه بعد دوباره امتحان کنید")
      : new ApiError(429, "too_many", "تعداد درخواست‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید");
  }
  return { sent: true, expiresIn: 120 };
});
