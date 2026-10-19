"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin, requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, optionalText, optionalUuid } from "@/lib/forms";
import { jalaliToIsoDate, parseJalali } from "@/lib/format";
import { notifyTeam, notifyUsers } from "@/lib/notify";
import { LEAVE_KIND_LABELS } from "@/lib/team";

function revalidateAttendance() {
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

function clientArg(formData: FormData): string | null {
  const clientId = formData.get("clientId");
  return isUuid(clientId) ? clientId : null;
}

export async function clockIn(formData: FormData): Promise<void> {
  const user = await requireTeam();
  const [open] = await db
    .select({ id: schema.attendance.id })
    .from(schema.attendance)
    .where(and(eq(schema.attendance.userId, user.id), isNull(schema.attendance.clockOut)));
  if (!open) await db.insert(schema.attendance).values({ userId: user.id, clientId: clientArg(formData), clockIn: new Date() });
  revalidateAttendance();
}

// Closes the current stretch and starts one on another client, so hours land on the right client
export async function switchClient(formData: FormData): Promise<void> {
  const user = await requireTeam();
  const now = new Date();
  await db.transaction(async (tx) => {
    const closed = await tx
      .update(schema.attendance)
      .set({ clockOut: now })
      .where(and(eq(schema.attendance.userId, user.id), isNull(schema.attendance.clockOut)))
      .returning({ id: schema.attendance.id });
    if (closed.length) await tx.insert(schema.attendance).values({ userId: user.id, clientId: clientArg(formData), clockIn: now });
  });
  revalidateAttendance();
}

export async function clockOut(): Promise<void> {
  const user = await requireTeam();
  await db
    .update(schema.attendance)
    .set({ clockOut: new Date() })
    .where(and(eq(schema.attendance.userId, user.id), isNull(schema.attendance.clockOut)));
  revalidateAttendance();
}

const isoDay = z.string().transform((v, ctx) => {
  const iso = jalaliToIsoDate(v);
  if (!iso) {
    ctx.addIssue({ code: "custom", message: "تاریخ را مثل ۱۴۰۵/۰۸/۰۱ بنویسید" });
    return z.NEVER;
  }
  return iso;
});

const leaveSchema = z
  .object({
    kind: z.enum(schema.leaveKindEnum.enumValues),
    startsOn: isoDay,
    endsOn: isoDay,
    reason: optionalText,
  })
  .refine((v) => v.endsOn >= v.startsOn, { path: ["endsOn"], error: "پایان مرخصی قبل از شروع آن است" });

export async function requestLeave(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const values = Object.fromEntries(["kind", "startsOn", "endsOn", "reason"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = leaveSchema.safeParse(values);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>, values };
  const [leave] = await db.insert(schema.leaveRequests).values({ userId: user.id, ...parsed.data }).returning({ id: schema.leaveRequests.id });
  await audit(user.id, "create", "leave_request", leave.id);
  if (user.role !== "admin") {
    await notifyTeam({ title: `درخواست ${LEAVE_KIND_LABELS[parsed.data.kind]} از ${user.name}`, body: parsed.data.reason ?? undefined, href: "/attendance" }, [], user.id);
  }
  revalidateAttendance();
  return { ok: true, message: user.role === "admin" ? "ثبت شد" : "درخواست برای مدیر فرستاده شد" };
}

export async function decideLeave(leaveId: string, approve: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(leaveId)) return;
  const [leave] = await db
    .update(schema.leaveRequests)
    .set({ status: approve ? "approved" : "rejected", decidedBy: admin.id, decidedAt: new Date() })
    .where(and(eq(schema.leaveRequests.id, leaveId), eq(schema.leaveRequests.status, "pending")))
    .returning();
  if (!leave) return;
  await audit(admin.id, approve ? "approve" : "reject", "leave_request", leaveId);
  await notifyUsers([leave.userId], { title: approve ? "مرخصی شما تأیید شد" : "مرخصی شما تأیید نشد", href: "/attendance" });
  revalidateAttendance();
}

export async function cancelLeave(leaveId: string): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(leaveId)) return;
  await db
    .delete(schema.leaveRequests)
    .where(and(eq(schema.leaveRequests.id, leaveId), eq(schema.leaveRequests.userId, user.id), eq(schema.leaveRequests.status, "pending")));
  revalidateAttendance();
}

const stretchSchema = z.object({
  userId: z.uuid({ error: "نفر را انتخاب کنید" }),
  day: z.string(),
  from: z.string(),
  to: z.string(),
  clientId: optionalUuid,
  note: optionalText,
});

// Admin correction: a forgotten clock-in or clock-out is added as a stretch by hand
export async function addStretch(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = Object.fromEntries(["userId", "day", "from", "to", "clientId", "note"].map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = stretchSchema.safeParse(values);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>, values };
  const clockIn = parseJalali(parsed.data.day, parsed.data.from);
  const clockOut = parseJalali(parsed.data.day, parsed.data.to);
  if (!clockIn) return { errors: { day: ["تاریخ و ساعت شروع را درست بنویسید"] }, values };
  if (!clockOut || clockOut <= clockIn) return { errors: { to: ["ساعت پایان باید بعد از شروع باشد"] }, values };
  const [row] = await db
    .insert(schema.attendance)
    .values({ userId: parsed.data.userId, clientId: parsed.data.clientId, clockIn, clockOut, note: parsed.data.note, editedBy: admin.id })
    .returning({ id: schema.attendance.id });
  await audit(admin.id, "create", "attendance", row.id, { userId: parsed.data.userId });
  revalidateAttendance();
  return { ok: true, message: "ثبت شد" };
}

export async function deleteStretch(stretchId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(stretchId)) return;
  await db.delete(schema.attendance).where(eq(schema.attendance.id, stretchId));
  await audit(admin.id, "delete", "attendance", stretchId);
  revalidateAttendance();
}

// Closes a stretch someone forgot to end, at the time the admin gives
export async function closeStretch(stretchId: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(stretchId)) return { message: "پیدا نشد" };
  const [s] = await db.select().from(schema.attendance).where(eq(schema.attendance.id, stretchId));
  if (!s || s.clockOut) return { message: "این بازه قبلاً بسته شده است" };
  const day = String(formData.get("day") ?? "");
  const time = String(formData.get("to") ?? "");
  const clockOut = parseJalali(day, time);
  if (!clockOut || clockOut <= s.clockIn) return { errors: { to: ["ساعت پایان باید بعد از شروع باشد"] }, values: { day, to: time } };
  await db.update(schema.attendance).set({ clockOut, editedBy: admin.id }).where(eq(schema.attendance.id, stretchId));
  await audit(admin.id, "close", "attendance", stretchId);
  revalidateAttendance();
  return { ok: true };
}
