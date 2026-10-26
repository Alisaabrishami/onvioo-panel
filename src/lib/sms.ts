import "server-only";

// Kavenegar "verify lookup" sends a pre-approved OTP template, which is
// delivered even to numbers that block advertising SMS.
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  const template = process.env.KAVENEGAR_OTP_TEMPLATE;
  // SMS_DRIVER=log prints codes to the server log instead of sending them
  if (process.env.SMS_DRIVER === "log" || !apiKey || !template) {
    if (process.env.SMS_DRIVER !== "log" && process.env.NODE_ENV === "production") {
      throw new Error("KAVENEGAR_API_KEY and KAVENEGAR_OTP_TEMPLATE must be set");
    }
    console.info(`[sms:dev] OTP for ${phone}: ${code}`);
    return;
  }
  const url = new URL(`https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`);
  url.searchParams.set("receptor", phone);
  url.searchParams.set("token", code);
  url.searchParams.set("template", template);
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Kavenegar responded ${res.status}`);
  }
}

// Short notices to clients ("your reel is ready for review"). Uses a
// Kavenegar lookup template whose %token10% holds the message, since that
// is the only token allowed to contain spaces.
export async function sendNotifySms(phone: string, message: string): Promise<void> {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  const template = process.env.KAVENEGAR_NOTIFY_TEMPLATE;
  if (process.env.SMS_DRIVER === "log") {
    console.info(`[sms:dev] notice for ${phone}: ${message}`);
    return;
  }
  if (!apiKey || !template) return;
  const url = new URL(`https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json`);
  url.searchParams.set("receptor", phone);
  url.searchParams.set("token", "Onvioo");
  url.searchParams.set("token10", message.slice(0, 100));
  url.searchParams.set("template", template);
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`Kavenegar responded ${res.status}`);
}
