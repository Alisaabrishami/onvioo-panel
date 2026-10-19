"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, invalid } from "@/lib/forms";
import { jalaliToIsoDate, toLatinDigits } from "@/lib/format";
import { notifyClient } from "@/lib/notify";

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

function revalidateContracts(id?: string) {
  revalidatePath("/contracts");
  revalidatePath("/portal/contracts");
  if (id) {
    revalidatePath(`/contracts/${id}`);
    revalidatePath(`/portal/contracts/${id}`);
  }
}

export async function createContract(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readContract(formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const [contract] = await db
    .insert(schema.contracts)
    .values({ ...parsed.data, createdBy: admin.id })
    .returning({ id: schema.contracts.id });
  await audit(admin.id, "create", "contract", contract.id, { title: parsed.data.title });
  revalidateContracts();
  redirect(`/contracts/${contract.id}`);
}

// Only drafts change; a sent contract goes back to draft first
export async function updateContract(contractId: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readContract(formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const updated = await db
    .update(schema.contracts)
    .set(parsed.data)
    .where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.status, "draft")))
    .returning({ id: schema.contracts.id });
  if (updated.length === 0) return { message: "فقط پیش‌نویس قابل ویرایش است" };
  await audit(admin.id, "update", "contract", contractId);
  revalidateContracts(contractId);
  return { ok: true, message: "ذخیره شد" };
}

export async function sendContract(contractId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(contractId)) return;
  const [contract] = await db
    .update(schema.contracts)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.status, "draft")))
    .returning();
  if (!contract) return;
  await audit(admin.id, "send", "contract", contractId);
  await notifyClient(
    contract.clientId,
    { title: `قرارداد «${contract.title}» برای امضای شما ارسال شد`, href: `/portal/contracts/${contract.id}` },
    { sms: true },
  );
  revalidateContracts(contractId);
}

// Pulls a sent contract back for edits, or cancels it outright
export async function withdrawContract(contractId: string, to: "draft" | "cancelled"): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(contractId) || (to !== "draft" && to !== "cancelled")) return;
  const from: ("draft" | "sent")[] = to === "draft" ? ["sent"] : ["draft", "sent"];
  await db
    .update(schema.contracts)
    .set({ status: to, sentAt: to === "draft" ? null : undefined })
    .where(and(eq(schema.contracts.id, contractId), inArray(schema.contracts.status, from)));
  await audit(admin.id, to === "draft" ? "withdraw" : "cancel", "contract", contractId);
  revalidateContracts(contractId);
}

export async function deleteContract(contractId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(contractId)) return;
  // Signed contracts are records and are never deleted
  await db.delete(schema.contracts).where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.status, "draft")));
  await audit(admin.id, "delete", "contract", contractId);
  revalidateContracts();
  redirect("/contracts");
}
