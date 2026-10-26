"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { accountLocked } from "@/lib/finance-data";
import { formatToman, jalaliToIsoDate, toLatinDigits } from "@/lib/format";
import { type FormState, optionalText, typedValues } from "@/lib/forms";
import { parseCount } from "@/lib/growth";
import { invoiceTotals, readItems } from "@/lib/invoice";
import { invoiceLabel, newPayToken, settleInvoice } from "@/lib/invoices-data";
import { notifyClient } from "@/lib/notify";
import { appUrl } from "@/lib/payment";
import { setSetting } from "@/lib/settings";

function revalidate(id?: string) {
  revalidatePath("/invoices");
  if (id) revalidatePath(`/invoices/${id}`);
  revalidatePath("/portal/invoices");
}

const num = (v: FormDataEntryValue | null) => {
  const n = parseCount(String(v ?? ""));
  return n == null ? null : n;
};

const headSchema = z.object({
  clientId: z.uuid({ error: "مشتری را انتخاب کنید" }),
  contractId: z.string().transform((v) => (isUuid(v) ? v : null)),
  title: z.string().trim().min(2, { error: "عنوان فاکتور را بنویسید" }),
  note: optionalText,
});

function readInvoice(formData: FormData) {
  const values = typedValues(formData);
  const errors: Record<string, string[]> = {};
  const head = headSchema.safeParse({
    clientId: values.clientId ?? "",
    contractId: values.contractId ?? "",
    title: values.title ?? "",
    note: values.note ?? "",
  });
  if (!head.success) Object.assign(errors, z.flattenError(head.error).fieldErrors);
  const items = readItems(
    formData.getAll("itemTitle").map(String),
    formData.getAll("itemQty").map((v) => (String(v).trim() === "" ? null : Number(toLatinDigits(String(v)).replace("٫", ".")))),
    formData.getAll("itemPrice").map(num),
  );
  if (typeof items === "string") errors.items = [items];
  const discount = num(formData.get("discount")) ?? 0;
  if (Number.isNaN(discount)) errors.discount = ["عدد نامعتبر"];
  const taxPct = Number(toLatinDigits(String(formData.get("taxPct") ?? "0")).replace(/[%٪\s]/g, "").replace("٫", ".") || "0");
  if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 30) errors.taxPct = ["درصد نامعتبر"];
  const issuedOn = jalaliToIsoDate(String(formData.get("issuedOn") ?? ""));
  if (!issuedOn) errors.issuedOn = ["تاریخ صدور را وارد کنید"];
  const dueText = String(formData.get("dueOn") ?? "").trim();
  const dueOn = dueText ? jalaliToIsoDate(dueText) : null;
  if (dueText && !dueOn) errors.dueOn = ["تاریخ نامعتبر"];
  if (issuedOn && dueOn && dueOn < issuedOn) errors.dueOn = ["مهلت قبل از تاریخ صدور است"];
  if (Object.keys(errors).length || !head.success || typeof items === "string") return { errors, values } as const;
  const taxBp = Math.round(taxPct * 100);
  const { total, subtotal } = invoiceTotals(items, discount, taxBp);
  if (discount > subtotal) return { errors: { discount: ["تخفیف بیشتر از جمع است"] } as Record<string, string[]>, values } as const;
  return { data: { ...head.data, items, discount, taxBp, total, issuedOn: issuedOn!, dueOn } } as const;
}

export async function createInvoice(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readInvoice(formData);
  if (!parsed.data) return { errors: parsed.errors, values: parsed.values };
  const [inv] = await db
    .insert(schema.invoices)
    .values({ ...parsed.data, payToken: newPayToken(), createdBy: admin.id })
    .returning({ id: schema.invoices.id });
  await audit(admin.id, "create", "invoice", inv.id, { total: parsed.data.total });
  if (formData.get("intent") === "send") await send(inv.id, admin.id);
  revalidate();
  redirect(`/invoices/${inv.id}`);
}

export async function updateInvoice(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const parsed = readInvoice(formData);
  if (!parsed.data) return { errors: parsed.errors, values: parsed.values };
  const [inv] = await db
    .update(schema.invoices)
    .set(parsed.data)
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.status, "draft")))
    .returning({ id: schema.invoices.id });
  if (!inv) return { message: "فقط پیش‌نویس قابل ویرایش است" };
  await audit(admin.id, "update", "invoice", id, { total: parsed.data.total });
  if (formData.get("intent") === "send") {
    await send(id, admin.id);
    revalidate(id);
    redirect(`/invoices/${id}`);
  }
  revalidate(id);
  return { ok: true, message: "ذخیره شد" };
}

async function send(id: string, userId: string) {
  const [inv] = await db
    .update(schema.invoices)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.status, "draft")))
    .returning();
  if (!inv) return;
  await audit(userId, "send", "invoice", id);
  await notifyClient(
    inv.clientId,
    { title: `${invoiceLabel(inv.number)} · ${formatToman(inv.total)}`, body: `پرداخت: ${appUrl()}/pay/${inv.payToken}`, href: `/portal/invoices/${inv.id}` },
    { sms: true },
  );
}

export async function sendInvoice(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  await send(id, admin.id);
  revalidate(id);
}

export async function remindInvoice(id: string): Promise<FormState> {
  await requireAdmin();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const [inv] = await db
    .update(schema.invoices)
    .set({ remindedAt: new Date() })
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.status, "sent")))
    .returning();
  if (!inv) return { message: "این فاکتور منتظر پرداخت نیست" };
  await notifyClient(
    inv.clientId,
    { title: `یادآوری ${invoiceLabel(inv.number)} · ${formatToman(inv.total)}`, body: `${appUrl()}/pay/${inv.payToken}`, href: `/portal/invoices/${inv.id}` },
    { sms: true },
  );
  revalidate(id);
  return { ok: true, message: "یادآوری فرستاده شد" };
}

export async function markPaid(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const accountId = String(formData.get("accountId") ?? "");
  if (!isUuid(accountId)) return { errors: { accountId: ["حساب را انتخاب کنید"] } };
  const day = jalaliToIsoDate(String(formData.get("day") ?? ""));
  if (!day) return { errors: { day: ["تاریخ را وارد کنید"] } };
  if (await accountLocked(accountId, day)) return { errors: { day: ["این تاریخ در دوره قفل‌شده حساب است"] } };
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const ok = await settleInvoice(id, { accountId, day, reference, byUserId: admin.id });
  if (!ok) return { message: "این فاکتور قبلاً پرداخت یا باطل شده است" };
  revalidate(id);
  revalidatePath("/finance", "layout");
  return { ok: true, message: "پرداخت ثبت شد" };
}

export async function cancelInvoice(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  await db.update(schema.invoices).set({ status: "cancelled" }).where(and(eq(schema.invoices.id, id), eq(schema.invoices.status, "sent")));
  await audit(admin.id, "cancel", "invoice", id);
  revalidate(id);
}

export async function deleteInvoice(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  await db.delete(schema.invoices).where(and(eq(schema.invoices.id, id), eq(schema.invoices.status, "draft")));
  await audit(admin.id, "delete", "invoice", id);
  revalidate();
  redirect("/invoices");
}

const settingsSchema = z.object({
  accountId: z.string().transform((v) => (isUuid(v) ? v : null)),
  taxPct: z.string().transform((v, ctx) => {
    const n = Number(toLatinDigits(v).replace(/[%٪\s]/g, "").replace("٫", ".") || "0");
    if (!Number.isFinite(n) || n < 0 || n > 30) {
      ctx.addIssue({ code: "custom", message: "درصد نامعتبر" });
      return z.NEVER;
    }
    return Math.round(n * 100);
  }),
  dueDays: z.string().transform((v, ctx) => {
    const n = Number(toLatinDigits(v) || "0");
    if (!Number.isInteger(n) || n < 0 || n > 90) {
      ctx.addIssue({ code: "custom", message: "۰ تا ۹۰ روز" });
      return z.NEVER;
    }
    return n;
  }),
});

export async function savePaymentSettings(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    accountId: formData.get("accountId") ?? "",
    taxPct: formData.get("taxPct") ?? "0",
    dueDays: formData.get("dueDays") ?? "7",
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  await setSetting("payment", { accountId: parsed.data.accountId, taxBp: parsed.data.taxPct, dueDays: parsed.data.dueDays });
  await audit(admin.id, "update", "settings", "payment");
  revalidate();
  return { ok: true, message: "ذخیره شد" };
}
