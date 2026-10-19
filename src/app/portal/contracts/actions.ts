"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireClient } from "@/lib/auth/dal";
import { requestOtp, verifyOtp } from "@/lib/auth/otp";
import { contractHash } from "@/lib/contract-hash";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { toLatinDigits } from "@/lib/format";
import { notifyTeam } from "@/lib/notify";

async function awaitingSignature(contractId: string, clientId: string) {
  if (!isUuid(contractId)) return null;
  const [contract] = await db
    .select()
    .from(schema.contracts)
    .where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.clientId, clientId), eq(schema.contracts.status, "sent")));
  return contract ?? null;
}

export async function sendSignCode(contractId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireClient();
  if (!(await awaitingSignature(contractId, user.clientId))) return { ok: false, error: "این قرارداد دیگر منتظر امضا نیست" };
  try {
    const res = await requestOtp(user.phone);
    if (!res.ok) {
      return { ok: false, error: res.error === "too_soon" ? "یک دقیقه صبر کنید و دوباره کد بگیرید" : "تعداد درخواست کد زیاد بود؛ یک ساعت دیگر امتحان کنید" };
    }
  } catch {
    return { ok: false, error: "ارسال پیامک ممکن نشد؛ کمی بعد دوباره امتحان کنید" };
  }
  return { ok: true };
}

export async function signContract(contractId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  const name = String(formData.get("signerName") ?? "").trim();
  const code = toLatinDigits(String(formData.get("code") ?? "")).trim();
  const values = { signerName: name };
  if (formData.get("agree") !== "on") return { errors: { agree: ["برای امضا باید متن را بپذیرید"] }, values };
  if (name.length < 3) return { errors: { signerName: ["نام و نام خانوادگی خود را بنویسید"] }, values };
  if (!/^\d{6}$/.test(code)) return { errors: { code: ["کد ۶ رقمی پیامک را وارد کنید"] }, values };

  const contract = await awaitingSignature(contractId, user.clientId);
  if (!contract) return { message: "این قرارداد دیگر منتظر امضا نیست", values };
  if (!(await verifyOtp(user.phone, code))) return { errors: { code: ["کد اشتباه است یا منقضی شده"] }, values };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const signed = await db
    .update(schema.contracts)
    .set({
      status: "signed",
      signedAt: new Date(),
      signedBy: user.id,
      signerName: name,
      signerPhone: user.phone,
      signerIp: ip,
      signerAgent: h.get("user-agent")?.slice(0, 500) ?? null,
      bodyHash: contractHash(contract),
    })
    // The status check makes a double submit sign only once
    .where(and(eq(schema.contracts.id, contract.id), eq(schema.contracts.status, "sent")))
    .returning({ id: schema.contracts.id });
  if (signed.length === 0) return { message: "این قرارداد دیگر منتظر امضا نیست", values };

  await audit(user.id, "sign", "contract", contract.id, { ip });
  await notifyTeam({ title: `قرارداد «${contract.title}» امضا شد`, body: `امضاکننده: ${name}`, href: `/contracts/${contract.id}` });
  revalidatePath(`/portal/contracts/${contract.id}`);
  revalidatePath("/portal/contracts");
  revalidatePath(`/contracts/${contract.id}`);
  return { ok: true };
}
