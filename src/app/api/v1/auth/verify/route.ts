import * as z from "zod";
import { verifyOtp } from "@/lib/auth/otp";
import { activeUserByPhone, deviceField, login, phoneField } from "@/lib/api/auth";
import { ApiError, body, open } from "@/lib/api/http";
import { toLatinDigits } from "@/lib/format";

// Trades the SMS code for a bearer token
export const POST = open(async (request) => {
  const input = await body(
    request,
    z.object({
      phone: phoneField,
      code: z.string({ error: "کد را بفرستید" }).transform((v) => toLatinDigits(v).trim()).pipe(z.string().regex(/^\d{6}$/, { error: "کد ۶ رقمی را وارد کنید" })),
      device: deviceField,
    }),
  );
  const user = await activeUserByPhone(input.phone);
  if (!user || !(await verifyOtp(input.phone, input.code))) throw new ApiError(401, "bad_code", "کد اشتباه یا منقضی شده است");
  return login(user, input.device, "otp");
});
