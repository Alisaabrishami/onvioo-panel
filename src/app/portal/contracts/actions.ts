"use server";

import { headers } from "next/headers";
import { requireClient } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { signContract as sign, sendSignCode as sendCode } from "@/lib/ops/contracts";
import { OpsError, opsFormState } from "@/lib/ops/errors";

export async function sendSignCode(contractId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireClient();
  if (!isUuid(contractId)) return { ok: false, error: "این قرارداد دیگر منتظر امضا نیست" };
  try {
    await sendCode(user, contractId);
    return { ok: true };
  } catch (error) {
    if (error instanceof OpsError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function signContract(contractId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  const values = { signerName: String(formData.get("signerName") ?? "") };
  const h = await headers();
  try {
    await sign(
      user,
      contractId,
      { signerName: values.signerName, code: String(formData.get("code") ?? ""), agree: formData.get("agree") === "on" },
      { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null, agent: h.get("user-agent") },
    );
    return { ok: true };
  } catch (error) {
    return opsFormState(error, values);
  }
}
