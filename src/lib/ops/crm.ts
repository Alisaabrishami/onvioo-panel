import "server-only";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import type { LeadStage } from "@/db/schema";
import { AiUnavailableError, askClaude } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/lib/crm";
import { normalizePhone } from "@/lib/format";
import { normalizeUsername } from "@/lib/instagram";
import { notifyUsers } from "@/lib/notify";
import { type Actor, OpsError, fieldError, missing, parseInput } from "./errors";

// The sales pipeline: leads, their history, and turning a won lead into a
// client. Shared by the panel and the mobile API.

const optional = z
  .string()
  .trim()
  .max(4000)
  .nullable()
  .optional()
  .transform((v) => v || null);

export const leadInput = z.object({
  name: z.string().trim().min(2, { error: "نام را بنویسید" }).max(200),
  business: optional,
  phone: optional.transform((v, ctx) => {
    if (!v) return null;
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "شماره موبایل نامعتبر است" });
      return z.NEVER;
    }
    return p;
  }),
  instagram: optional.transform((v, ctx) => {
    if (!v) return null;
    const u = normalizeUsername(v);
    if (!u) {
      ctx.addIssue({ code: "custom", message: "نام کاربری اینستاگرام نامعتبر است" });
      return z.NEVER;
    }
    return u;
  }),
  source: z.enum(schema.leadSourceEnum.enumValues, { error: "منبع معتبر نیست" }).default("instagram"),
  value: z.number({ error: "ارزش را با عدد بفرستید" }).int().nonnegative().nullable().optional().transform((v) => v ?? null),
  services: optional,
  ownerId: z.uuid({ error: "مسئول معتبر نیست" }).nullable().optional().transform((v) => v ?? null),
  nextFollowUp: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "تاریخ پیگیری را به‌صورت YYYY-MM-DD بفرستید" })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  notes: optional,
});
export type LeadInput = z.input<typeof leadInput>;

function teamOnly(actor: Actor) {
  if (actor.role === "client") throw new OpsError("forbidden", "این بخش برای حساب شما نیست", 403);
}

function revalidate(id?: string) {
  revalidatePath("/crm");
  if (id) revalidatePath(`/crm/${id}`);
}

async function checkOwner(ownerId: string | null) {
  if (!ownerId) return;
  const [owner] = await db.select({ role: schema.users.role, active: schema.users.active }).from(schema.users).where(eq(schema.users.id, ownerId));
  if (!owner || owner.role === "client" || !owner.active) throw fieldError("ownerId", "مسئول باید از اعضای فعال تیم باشد");
}

export async function getLead(actor: Actor, id: string) {
  teamOnly(actor);
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) throw missing("سرنخ پیدا نشد");
  return lead;
}

export async function createLead(actor: Actor, raw: unknown) {
  teamOnly(actor);
  const input = parseInput(leadInput, raw);
  const ownerId = input.ownerId ?? actor.id;
  await checkOwner(ownerId);
  const [lead] = await db.insert(schema.leads).values({ ...input, ownerId }).returning();
  await db.insert(schema.leadActivities).values({ leadId: lead.id, kind: "stage", body: `ثبت سرنخ از ${LEAD_SOURCE_LABELS[input.source]}`, userId: actor.id });
  await audit(actor.id, "create", "lead", lead.id);
  if (ownerId !== actor.id) await notifyUsers([ownerId], { title: `سرنخ تازه به شما سپرده شد: ${input.name}`, href: `/crm/${lead.id}` });
  revalidate();
  return lead;
}

export async function updateLead(actor: Actor, id: string, raw: unknown) {
  const before = await getLead(actor, id);
  const input = parseInput(leadInput, raw);
  await checkOwner(input.ownerId);
  const [lead] = await db.update(schema.leads).set({ ...input, updatedAt: new Date() }).where(eq(schema.leads.id, id)).returning();
  await audit(actor.id, "update", "lead", id);
  if (input.ownerId && input.ownerId !== before.ownerId)
    await notifyUsers([input.ownerId], { title: `سرنخ ${input.name} به شما سپرده شد`, href: `/crm/${id}` }, actor.id);
  revalidate(id);
  return lead;
}

export async function moveLead(actor: Actor, id: string, stage: LeadStage, reason?: string | null) {
  if (!schema.leadStageEnum.enumValues.includes(stage)) throw fieldError("stage", "مرحله معتبر نیست");
  const lead = await getLead(actor, id);
  if (lead.stage === stage) return lead;
  const why = reason?.trim() || null;
  if (stage === "lost" && !why) throw fieldError("reason", "دلیل از دست رفتن را بنویسید");
  const [moved] = await db
    .update(schema.leads)
    .set({ stage, lostReason: stage === "lost" ? why : null, updatedAt: new Date(), nextFollowUp: stage === "won" || stage === "lost" ? null : lead.nextFollowUp })
    .where(eq(schema.leads.id, id))
    .returning();
  await db.insert(schema.leadActivities).values({
    leadId: id,
    kind: "stage",
    body: `${LEAD_STAGE_LABELS[lead.stage]} ← ${LEAD_STAGE_LABELS[stage]}${why ? ` · ${why}` : ""}`,
    userId: actor.id,
  });
  await audit(actor.id, "move", "lead", id, { from: lead.stage, to: stage });
  revalidate(id);
  return moved;
}

export const activityInput = z.object({
  kind: z.enum(["note", "call", "message", "meeting"], { error: "نوع فعالیت معتبر نیست" }).default("note"),
  body: z.string().trim().min(2, { error: "شرح را بنویسید" }).max(4000),
  nextFollowUp: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "تاریخ پیگیری را به‌صورت YYYY-MM-DD بفرستید" })
    .nullable()
    .optional(),
});

// Logging contact moves a brand-new lead to "contacted" and sets the next follow-up when given
export async function logActivity(actor: Actor, leadId: string, raw: unknown) {
  const lead = await getLead(actor, leadId);
  const input = parseInput(activityInput, raw);
  const [activity] = await db.insert(schema.leadActivities).values({ leadId, kind: input.kind, body: input.body, userId: actor.id }).returning();
  await db
    .update(schema.leads)
    .set({
      updatedAt: new Date(),
      ...(input.nextFollowUp !== undefined ? { nextFollowUp: input.nextFollowUp } : {}),
      ...(lead.stage === "new" && input.kind !== "note" ? { stage: "contacted" as const } : {}),
    })
    .where(eq(schema.leads.id, leadId));
  revalidate(leadId);
  return activity;
}

export async function leadActivities(leadId: string) {
  return db
    .select({ id: schema.leadActivities.id, kind: schema.leadActivities.kind, body: schema.leadActivities.body, createdAt: schema.leadActivities.createdAt, author: schema.users.name })
    .from(schema.leadActivities)
    .leftJoin(schema.users, eq(schema.users.id, schema.leadActivities.userId))
    .where(eq(schema.leadActivities.leadId, leadId))
    .orderBy(desc(schema.leadActivities.createdAt));
}

// A won lead becomes a client; the lead keeps a link to it. Returns the client id.
export async function convertLead(actor: Actor, id: string): Promise<{ clientId: string; created: boolean }> {
  const lead = await getLead(actor, id);
  if (lead.clientId) return { clientId: lead.clientId, created: false };
  const [client] = await db
    .insert(schema.clients)
    .values({ name: lead.business ?? lead.name, brand: lead.business, phone: lead.phone, instagram: lead.instagram, status: "active", notes: lead.services })
    .returning({ id: schema.clients.id });
  await db.update(schema.leads).set({ clientId: client.id, stage: "won", nextFollowUp: null, updatedAt: new Date() }).where(eq(schema.leads.id, id));
  if (lead.stage !== "won")
    await db.insert(schema.leadActivities).values({ leadId: id, kind: "stage", body: `${LEAD_STAGE_LABELS[lead.stage]} ← ${LEAD_STAGE_LABELS.won}`, userId: actor.id });
  await db.insert(schema.leadActivities).values({ leadId: id, kind: "note", body: "به مشتری تبدیل شد", userId: actor.id });
  await audit(actor.id, "convert", "lead", id, { clientId: client.id });
  revalidate(id);
  revalidatePath("/clients");
  return { clientId: client.id, created: true };
}

export async function deleteLead(actor: Actor, id: string) {
  if (actor.role !== "admin") throw new OpsError("forbidden", "حذف سرنخ فقط با مدیر است", 403);
  await getLead(actor, id);
  await db.delete(schema.leads).where(eq(schema.leads.id, id));
  await audit(actor.id, "delete", "lead", id);
  revalidate();
}

const draftSchema = z.object({ message: z.string().describe("The follow-up message in Persian, ready to paste into Instagram Direct or WhatsApp; warm, short, no hashtags") });

export async function draftFollowUp(actor: Actor, id: string): Promise<string> {
  const lead = await getLead(actor, id);
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
    return message;
  } catch (error) {
    if (error instanceof AiUnavailableError) throw new OpsError("ai_unavailable", "برای این کار کلید Claude API لازم است.", 503);
    console.error("[crm] draft failed", error);
    throw new OpsError("ai_failed", "پیش‌نویس ساخته نشد؛ دوباره امتحان کنید.", 502);
  }
}
