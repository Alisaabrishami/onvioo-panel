"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { schema } from "@/db";
import type { LeadStage } from "@/db/schema";
import { requireAdmin, requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { jalaliToIsoDate, normalizePhone } from "@/lib/format";
import { type FormState, optionalText, optionalUuid, typedValues } from "@/lib/forms";
import { parseCount } from "@/lib/growth";
import { normalizeUsername } from "@/lib/instagram";
import * as ops from "@/lib/ops/crm";
import { opsFormState } from "@/lib/ops/errors";

const leadSchema = z.object({
  name: z.string().trim().min(2, { error: "نام را بنویسید" }),
  business: optionalText,
  phone: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "شماره موبایل نامعتبر است" });
      return z.NEVER;
    }
    return p;
  }),
  instagram: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const u = normalizeUsername(v);
    if (!u) {
      ctx.addIssue({ code: "custom", message: "نام کاربری اینستاگرام نامعتبر است" });
      return z.NEVER;
    }
    return u;
  }),
  source: z.enum(schema.leadSourceEnum.enumValues),
  value: z.string().transform((v, ctx) => {
    const n = parseCount(v);
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: "custom", message: "عدد نامعتبر" });
      return z.NEVER;
    }
    return n;
  }),
  services: optionalText,
  ownerId: optionalUuid,
  nextFollowUp: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const d = jalaliToIsoDate(v);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "تاریخ را مثل ۱۴۰۵/۰۸/۰۲ بنویسید" });
      return z.NEVER;
    }
    return d;
  }),
  notes: optionalText,
});

function readLead(formData: FormData) {
  const v = typedValues(formData);
  return leadSchema.safeParse({
    name: v.name ?? "",
    business: v.business ?? "",
    phone: v.phone ?? "",
    instagram: v.instagram ?? "",
    source: v.source ?? "instagram",
    value: v.value ?? "",
    services: v.services ?? "",
    ownerId: v.ownerId ?? "",
    nextFollowUp: v.nextFollowUp ?? "",
    notes: v.notes ?? "",
  });
}

const fieldErrors = (error: z.ZodError) => z.flattenError(error).fieldErrors as Record<string, string[]>;

// The form speaks Jalali dates and "1.5m" amounts; the shared rules take ISO days and numbers
function leadData(data: z.infer<typeof leadSchema>) {
  return { ...data, value: data.value == null ? null : Math.round(data.value) };
}

export async function createLead(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = readLead(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: typedValues(formData) };
  try {
    await ops.createLead(user, leadData(parsed.data));
    return { ok: true, message: "سرنخ ثبت شد" };
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
}

export async function updateLead(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const parsed = readLead(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: typedValues(formData) };
  try {
    await ops.updateLead(user, id, leadData(parsed.data));
    return { ok: true, message: "ذخیره شد" };
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
}

export async function moveLead(id: string, stage: LeadStage, _?: FormState, formData?: FormData): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(id)) return { message: "نامعتبر" };
  try {
    await ops.moveLead(user, id, stage, String(formData?.get("reason") ?? ""));
    return { ok: true };
  } catch (error) {
    const state = opsFormState(error);
    return { message: state.errors?.reason?.[0] ?? state.errors?.stage?.[0] ?? state.message };
  }
}

export async function addActivity(leadId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(leadId)) return { message: "پیدا نشد" };
  const followText = String(formData.get("nextFollowUp") ?? "").trim();
  const next = followText ? jalaliToIsoDate(followText) : undefined;
  if (followText && !next) return { errors: { nextFollowUp: ["تاریخ نامعتبر"] }, values: typedValues(formData) };
  try {
    await ops.logActivity(user, leadId, { kind: String(formData.get("kind") ?? "note"), body: String(formData.get("body") ?? ""), nextFollowUp: next });
    return { ok: true, message: "ثبت شد" };
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
}

// A won lead becomes a client; the lead keeps a link to it
export async function convertLead(id: string): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(id)) return;
  let clientId: string;
  try {
    clientId = (await ops.convertLead(user, id)).clientId;
  } catch (error) {
    opsFormState(error);
    return;
  }
  redirect(`/clients/${clientId}`);
}

export async function deleteLead(id: string): Promise<void> {
  const user = await requireAdmin();
  if (!isUuid(id)) return;
  await ops.deleteLead(user, id).catch((error) => opsFormState(error));
  redirect("/crm");
}

export async function draftFollowUp(id: string): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  try {
    return { ok: true, message: await ops.draftFollowUp(user, id) };
  } catch (error) {
    return opsFormState(error);
  }
}

export async function advanceLead(id: string, stage: LeadStage): Promise<void> {
  await moveLead(id, stage);
}
