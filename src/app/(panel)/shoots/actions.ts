"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, invalid, jalaliField, optionalText, optionalUuid, requiredJalali } from "@/lib/forms";
import { toLatinDigits } from "@/lib/format";

const shootSchema = z.object({
  title: z.string().trim().min(2, { error: "عنوان جلسه را وارد کنید" }),
  clientId: z.uuid({ error: "مشتری را انتخاب کنید" }),
  startsAt: requiredJalali,
  durationMinutes: z.coerce
    .number({ error: "مدت را به دقیقه وارد کنید" })
    .int()
    .min(10, { error: "حداقل ۱۰ دقیقه" })
    .max(24 * 60, { error: "حداکثر ۲۴ ساعت" }),
  location: optionalText,
  crewId: optionalUuid,
  script: optionalText,
  checklist: optionalText,
  notes: optionalText,
});

function readShootForm(formData: FormData) {
  return shootSchema.safeParse({
    title: formData.get("title") ?? "",
    clientId: formData.get("clientId") ?? "",
    startsAt: jalaliField(formData, "startsAt"),
    durationMinutes: toLatinDigits(String(formData.get("durationMinutes") ?? "")) || "120",
    location: formData.get("location") ?? "",
    crewId: formData.get("crewId") ?? "",
    script: formData.get("script") ?? "",
    checklist: formData.get("checklist") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

function revalidateShoots(id?: string) {
  revalidatePath("/shoots");
  revalidatePath("/calendar");
  if (id) revalidatePath(`/shoots/${id}`);
}

export async function createShoot(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = readShootForm(formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  const [shoot] = await db
    .insert(schema.shoots)
    .values({ ...parsed.data, startsAt: parsed.data.startsAt!, createdBy: user.id })
    .returning({ id: schema.shoots.id });
  await audit(user.id, "create", "shoot", shoot.id, { title: parsed.data.title });
  revalidateShoots();
  redirect(`/shoots/${shoot.id}`);
}

export async function updateShoot(shootId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = readShootForm(formData);
  if (!parsed.success) return invalid(parsed.error, formData);
  await db
    .update(schema.shoots)
    .set({ ...parsed.data, startsAt: parsed.data.startsAt! })
    .where(eq(schema.shoots.id, shootId));
  await audit(user.id, "update", "shoot", shootId, { title: parsed.data.title });
  revalidateShoots(shootId);
  return { ok: true, message: "ذخیره شد" };
}

// Ticks or unticks one checklist line; "x " at the start marks it packed
export async function toggleChecklistItem(shootId: string, index: number): Promise<void> {
  await requireTeam();
  if (!isUuid(shootId)) return;
  const [shoot] = await db.select({ checklist: schema.shoots.checklist }).from(schema.shoots).where(eq(schema.shoots.id, shootId));
  if (!shoot?.checklist) return;
  const lines = shoot.checklist.split("\n");
  const line = lines[index];
  if (line === undefined) return;
  lines[index] = line.startsWith("x ") ? line.slice(2) : `x ${line}`;
  await db.update(schema.shoots).set({ checklist: lines.join("\n") }).where(eq(schema.shoots.id, shootId));
  revalidatePath(`/shoots/${shootId}`);
}

export async function deleteShoot(shootId: string): Promise<void> {
  const user = await requireTeam();
  if (user.role !== "admin" || !isUuid(shootId)) return;
  await db.delete(schema.shoots).where(eq(schema.shoots.id, shootId));
  await audit(user.id, "delete", "shoot", shootId);
  revalidateShoots();
  redirect("/shoots");
}
