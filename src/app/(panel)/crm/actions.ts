"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import type { LeadStage } from "@/db/schema";
import { AiUnavailableError, askClaude } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { requireAdmin, requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/lib/crm";
import { jalaliToIsoDate, normalizePhone } from "@/lib/format";
import { type FormState, optionalText, optionalUuid, typedValues } from "@/lib/forms";
import { parseCount } from "@/lib/growth";
import { normalizeUsername } from "@/lib/instagram";
import { notifyUsers } from "@/lib/notify";

function revalidate(id?: string) {
  revalidatePath("/crm");
  if (id) revalidatePath(`/crm/${id}`);
}

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

export async function createLead(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const parsed = readLead(formData);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>, values: typedValues(formData) };
  const ownerId = parsed.data.ownerId ?? user.id;
  const [lead] = await db.insert(schema.leads).values({ ...parsed.data, ownerId }).returning({ id: schema.leads.id });
  await db.insert(schema.leadActivities).values({ leadId: lead.id, kind: "stage", body: `ثبت سرنخ از ${LEAD_SOURCE_LABELS[parsed.data.source]}`, userId: user.id });
  await audit(user.id, "create", "lead", lead.id);
  if (ownerId !== user.id) await notifyUsers([ownerId], { title: `سرنخ تازه به شما سپرده شد: ${parsed.data.name}`, href: `/crm/${lead.id}` });
  revalidate();
  return { ok: true, message: "سرنخ ثبت شد" };
}

export async function updateLead(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const parsed = readLead(formData);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>, values: typedValues(formData) };
  const [before] = await db.select({ ownerId: schema.leads.ownerId }).from(schema.leads).where(eq(schema.leads.id, id));
  if (!before) return { message: "پیدا نشد" };
  await db.update(schema.leads).set({ ...parsed.data, updatedAt: new Date() }).where(eq(schema.leads.id, id));
  await audit(user.id, "update", "lead", id);
  if (parsed.data.ownerId && parsed.data.ownerId !== before.ownerId)
    await notifyUsers([parsed.data.ownerId], { title: `سرنخ ${parsed.data.name} به شما سپرده شد`, href: `/crm/${id}` }, user.id);
  revalidate(id);
  return { ok: true, message: "ذخیره شد" };
}

export async function moveLead(id: string, stage: LeadStage, _?: FormState, formData?: FormData): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(id) || !schema.leadStageEnum.enumValues.includes(stage)) return { message: "نامعتبر" };
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead || lead.stage === stage) return {};
  const reason = String(formData?.get("reason") ?? "").trim() || null;
  if (stage === "lost" && !reason) return { message: "دلیل از دست رفتن را بنویسید" };
  await db
    .update(schema.leads)
    .set({ stage, lostReason: stage === "lost" ? reason : null, updatedAt: new Date(), nextFollowUp: stage === "won" || stage === "lost" ? null : lead.nextFollowUp })
    .where(eq(schema.leads.id, id));
  await db.insert(schema.leadActivities).values({
    leadId: id,
    kind: "stage",
    body: `${LEAD_STAGE_LABELS[lead.stage]} ← ${LEAD_STAGE_LABELS[stage]}${reason ? ` · ${reason}` : ""}`,
    userId: user.id,
  });
  await audit(user.id, "move", "lead", id, { from: lead.stage, to: stage });
  revalidate(id);
  return { ok: true };
}

const activitySchema = z.object({
  kind: z.enum(["note", "call", "message", "meeting"]),
  body: z.string().trim().min(2, { error: "شرح را بنویسید" }),
});

export async function addActivity(leadId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(leadId)) return { message: "پیدا نشد" };
  const parsed = activitySchema.safeParse({ kind: formData.get("kind") ?? "note", body: formData.get("body") ?? "" });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>, values: typedValues(formData) };
  const followText = String(formData.get("nextFollowUp") ?? "").trim();
  const next = followText ? jalaliToIsoDate(followText) : undefined;
  if (followText && !next) return { errors: { nextFollowUp: ["تاریخ نامعتبر"] }, values: typedValues(formData) };
  await db.insert(schema.leadActivities).values({ leadId, ...parsed.data, userId: user.id });
  // Logging contact moves a brand-new lead to "contacted" and sets the next follow-up when given
  const [lead] = await db.select({ stage: schema.leads.stage }).from(schema.leads).where(eq(schema.leads.id, leadId));
  await db
    .update(schema.leads)
    .set({
      updatedAt: new Date(),
      ...(next !== undefined ? { nextFollowUp: next } : {}),
      ...(lead?.stage === "new" && parsed.data.kind !== "note" ? { stage: "contacted" as const } : {}),
    })
    .where(eq(schema.leads.id, leadId));
  revalidate(leadId);
  return { ok: true, message: "ثبت شد" };
}

// A won lead becomes a client; the lead keeps a link to it
export async function convertLead(id: string): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(id)) return;
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) return;
  if (lead.clientId) redirect(`/clients/${lead.clientId}`);
  const [client] = await db
    .insert(schema.clients)
    .values({ name: lead.business ?? lead.name, brand: lead.business, phone: lead.phone, instagram: lead.instagram, status: "active", notes: lead.services })
    .returning({ id: schema.clients.id });
  await db.update(schema.leads).set({ clientId: client.id, stage: "won", nextFollowUp: null, updatedAt: new Date() }).where(eq(schema.leads.id, id));
  if (lead.stage !== "won")
    await db.insert(schema.leadActivities).values({ leadId: id, kind: "stage", body: `${LEAD_STAGE_LABELS[lead.stage]} ← ${LEAD_STAGE_LABELS.won}`, userId: user.id });
  await db.insert(schema.leadActivities).values({ leadId: id, kind: "note", body: "به مشتری تبدیل شد", userId: user.id });
  await audit(user.id, "convert", "lead", id, { clientId: client.id });
  revalidate(id);
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function deleteLead(id: string): Promise<void> {
  const user = await requireAdmin();
  if (!isUuid(id)) return;
  await db.delete(schema.leads).where(eq(schema.leads.id, id));
  await audit(user.id, "delete", "lead", id);
  revalidate();
  redirect("/crm");
}

const draftSchema = z.object({ message: z.string().describe("The follow-up message in Persian, ready to paste into Instagram Direct or WhatsApp; warm, short, no hashtags") });

export async function draftFollowUp(id: string): Promise<FormState> {
  await requireTeam();
  if (!isUuid(id)) return { message: "پیدا نشد" };
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) return { message: "پیدا نشد" };
  const acts = await db.select().from(schema.leadActivities).where(eq(schema.leadActivities.leadId, id)).orderBy(desc(schema.leadActivities.createdAt)).limit(8);
  try {
    const { message } = await askClaude({
      system:
        "You write follow-up messages for Onvioo, an Iranian social-media and web agency, to potential clients. Write in natural, polite Persian, 2–4 short sentences, refer to what was discussed, and end with one clear next step (a call, a meeting time, or sending a proposal).",
      prompt: JSON.stringify({
        lead: { name: lead.name, business: lead.business, stage: LEAD_STAGE_LABELS[lead.stage], services: lead.services, notes: lead.notes },
        history: acts.reverse().map((a) => ({ kind: a.kind, body: a.body, at: a.createdAt.toISOString().slice(0, 10) })),
      }),
      schema: draftSchema,
      toolName: "follow_up_message",
      toolDescription: "Return the follow-up message",
      maxTokens: 600,
      mock: () => ({
        message: `سلام ${lead.name} عزیز، وقت بخیر. پیرو صحبتمان درباره ${lead.services ?? "خدمات Onvioo"} برای ${lead.business ?? "کسب‌وکارتان"}، یک برنامه پیشنهادی آماده کرده‌ایم. اگر موافق باشید این هفته یک تماس کوتاه داشته باشیم تا جزئیات را با هم مرور کنیم؟`,
      }),
    });
    return { ok: true, message };
  } catch (error) {
    if (error instanceof AiUnavailableError) return { message: "برای این کار کلید Claude API لازم است." };
    console.error("[crm] draft failed", error);
    return { message: "پیش‌نویس ساخته نشد؛ دوباره امتحان کنید." };
  }
}


export async function advanceLead(id: string, stage: LeadStage): Promise<void> {
  await moveLead(id, stage);
}
