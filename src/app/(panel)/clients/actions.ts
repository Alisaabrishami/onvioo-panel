"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { deleteUserSessions } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/format";

export type FormState = {
  errors?: Record<string, string[]>;
  // What the user typed, so a failed submit does not clear the form
  values?: Record<string, string>;
  message?: string;
  ok?: boolean;
};

function typedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string" && k !== "password" && !k.startsWith("$")) values[k] = v;
  });
  return values;
}

const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null);

const optionalPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "شماره موبایل معتبر نیست" });
      return z.NEVER;
    }
    return phone;
  });

const clientSchema = z.object({
  name: z.string().trim().min(2, { error: "نام مشتری را وارد کنید" }),
  brand: optionalText,
  instagram: optionalText.transform((v) => v?.replace(/^@/, "") ?? null),
  phone: optionalPhone,
  status: z.enum(schema.clientStatusEnum.enumValues),
  notes: optionalText,
});

function readClientForm(formData: FormData) {
  return clientSchema.safeParse({
    name: formData.get("name") ?? "",
    brand: formData.get("brand") ?? "",
    instagram: formData.get("instagram") ?? "",
    phone: formData.get("phone") ?? "",
    status: formData.get("status") ?? "active",
    notes: formData.get("notes") ?? "",
  });
}

export async function createClient(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readClientForm(formData);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: typedValues(formData) };

  const [client] = await db.insert(schema.clients).values(parsed.data).returning();
  await audit(admin.id, "create", "client", client.id, { name: client.name });
  redirect(`/clients/${client.id}`);
}

export async function updateClient(
  clientId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = readClientForm(formData);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: typedValues(formData) };

  await db.update(schema.clients).set(parsed.data).where(eq(schema.clients.id, clientId));
  await audit(admin.id, "update", "client", clientId, parsed.data);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: "ذخیره شد" };
}

const portalUserSchema = z.object({
  name: z.string().trim().min(2, { error: "نام را وارد کنید" }),
  phone: optionalPhone.refine((v) => v !== null, { error: "شماره موبایل را وارد کنید" }),
});

export async function addPortalUser(
  clientId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = portalUserSchema.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: typedValues(formData) };

  const phone = parsed.data.phone!;
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.phone, phone));
  if (existing) return { errors: { phone: ["این شماره قبلاً در پنل ثبت شده است"] }, values: typedValues(formData) };

  const [user] = await db
    .insert(schema.users)
    .values({ name: parsed.data.name, phone, role: "client", clientId })
    .returning({ id: schema.users.id });
  await audit(admin.id, "create", "portal_user", user.id, { clientId, phone });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: "دسترسی پرتال ساخته شد؛ مشتری با کد پیامکی وارد می‌شود" };
}

export async function removePortalUser(clientId: string, userId: string): Promise<void> {
  const admin = await requireAdmin();
  await deleteUserSessions(userId);
  await db
    .delete(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.clientId, clientId),
        eq(schema.users.role, "client"),
      ),
    );
  await audit(admin.id, "delete", "portal_user", userId, { clientId });
  revalidatePath(`/clients/${clientId}`);
}
