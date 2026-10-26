"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, invalid, typedValues } from "@/lib/forms";
import { jalaliToIsoDate, toLatinDigits } from "@/lib/format";
import * as ops from "@/lib/ops/contracts";
import { opsFormState } from "@/lib/ops/errors";

const optionalDate = z.string().transform((v, ctx) => {
  if (!v.trim()) return null;
  const iso = jalaliToIsoDate(v);
  if (!iso) {
    ctx.addIssue({ code: "custom", message: "تاریخ معتبر نیست (مثل ۱۴۰۵/۰۸/۰۱)" });
    return z.NEVER;
  }
  return iso;
});

const contractSchema = z
  .object({
    clientId: z.uuid({ error: "مشتری را انتخاب کنید" }),
    title: z.string().trim().min(3, { error: "عنوان قرارداد را بنویسید" }),
    body: z.string().trim().min(20, { error: "متن قرارداد خیلی کوتاه است" }),
    amount: z.string().transform((v, ctx) => {
      const digits = toLatinDigits(v).replace(/[,،\s]/g, "");
      if (!digits) return null;
      if (!/^\d+$/.test(digits)) {
        ctx.addIssue({ code: "custom", message: "مبلغ را فقط با عدد بنویسید" });
        return z.NEVER;
      }
      return Number(digits);
    }),
    startsOn: optionalDate,
    endsOn: optionalDate,
  })
  .refine((c) => !c.startsOn || !c.endsOn || c.startsOn <= c.endsOn, {
    path: ["endsOn"],
    error: "پایان قرارداد قبل از شروع آن است",
  });

function readContract(formData: FormData) {
  return contractSchema.safeParse({
    clientId: formData.get("clientId") ?? "",
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    amount: formData.get("amount") ?? "",
    startsOn: formData.get("startsOn") ?? "",
    endsOn: formData.get("endsOn") ?? "",
  });
}

export async function createContract(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readContract(formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  let id: string;
  try {
    id = (await ops.createContract(admin, parsed.data)).id;
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
  redirect(`/contracts/${id}`);
}

// Only drafts change; a sent contract goes back to draft first
export async function updateContract(contractId: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readContract(formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  try {
    await ops.updateContract(admin, contractId, parsed.data);
    return { ok: true, message: "ذخیره شد" };
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
}

const quietly = (error: unknown) => {
  opsFormState(error);
};

export async function sendContract(contractId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(contractId)) return;
  await ops.sendContract(admin, contractId).catch(quietly);
}

// Pulls a sent contract back for edits, or cancels it outright
export async function withdrawContract(contractId: string, to: "draft" | "cancelled"): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(contractId)) return;
  await ops.withdrawContract(admin, contractId, to).catch(quietly);
}

export async function deleteContract(contractId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(contractId)) return;
  await ops.deleteContract(admin, contractId).catch(quietly);
  redirect("/contracts");
}
