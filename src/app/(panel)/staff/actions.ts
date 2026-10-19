"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";
import { deleteUserSessions } from "@/lib/auth/session";
import { normalizePhone, toLatinDigits } from "@/lib/format";

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

const staffSchema = z.object({
  name: z.string().trim().min(2, { error: "نام را وارد کنید" }),
  phone: z.string().transform((v, ctx) => {
    const phone = normalizePhone(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "شماره موبایل معتبر نیست" });
      return z.NEVER;
    }
    return phone;
  }),
  role: z.enum(["admin", "staff"]),
  title: z
    .string()
    .trim()
    .transform((v) => v || null),
  payType: z.enum(schema.payTypeEnum.enumValues),
  rate: z
    .string()
    .transform((v) => Number(toLatinDigits(v).replace(/[,٬\s]/g, "") || "0"))
    .pipe(z.number().int({ error: "مبلغ را به عدد وارد کنید" }).min(0)),
  password: z
    .string()
    .transform((v) => v || null)
    .refine((v) => v === null || v.length >= 8, { error: "رمز عبور حداقل ۸ کاراکتر باشد" }),
});

export async function createStaff(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: typedValues(formData) };

  const { name, phone, role, title, payType, rate, password } = parsed.data;
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.phone, phone));
  if (existing) return { errors: { phone: ["این شماره قبلاً در پنل ثبت شده است"] }, values: typedValues(formData) };

  const passwordHash = password ? await hashPassword(password) : null;
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({ name, phone, role, passwordHash })
      .returning({ id: schema.users.id });
    await tx.insert(schema.staffProfiles).values({ userId: user.id, title, payType, rate });
    return user.id;
  });
  await audit(admin.id, "create", "staff", userId, { name, role });
  revalidatePath("/staff");
  return { ok: true, message: `${name} اضافه شد` };
}

export async function setStaffActive(userId: string, active: boolean): Promise<void> {
  const admin = await requireAdmin();
  // An admin cannot lock themselves out
  if (userId === admin.id) return;
  await db
    .update(schema.users)
    .set({ active })
    .where(and(eq(schema.users.id, userId), ne(schema.users.role, "client")));
  if (!active) await deleteUserSessions(userId);
  await audit(admin.id, active ? "activate" : "deactivate", "staff", userId);
  revalidatePath("/staff");
}
