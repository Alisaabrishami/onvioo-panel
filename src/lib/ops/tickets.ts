import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import type { TicketStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { notifyClient, notifyTeam } from "@/lib/notify";
import { type Actor, OpsError, fieldError, missing, parseInput } from "./errors";
import { claimAttachments } from "./uploads";

// Support tickets for the panel, the portal and the mobile API

export const ticketInput = z.object({
  title: z.string().trim().min(3, { error: "موضوع را بنویسید" }).max(200, { error: "موضوع خیلی طولانی است" }),
  body: z.string().trim().min(5, { error: "توضیح بیشتری بنویسید" }).max(10000),
  projectId: z.uuid({ error: "پروژه معتبر نیست" }).nullable().optional(),
  priority: z.enum(["normal", "high", "urgent"], { error: "فوریت معتبر نیست" }).default("normal"),
  fileIds: z.array(z.uuid()).max(10, { error: "حداکثر ۱۰ فایل پیوست کنید" }).default([]),
});

export const messageInput = z.object({
  body: z.string().trim().max(10000).default(""),
  fileIds: z.array(z.uuid()).max(10, { error: "حداکثر ۱۰ فایل پیوست کنید" }).default([]),
});

function revalidateTicket(id?: string) {
  revalidatePath("/tickets");
  revalidatePath("/portal/tickets");
  if (id) {
    revalidatePath(`/tickets/${id}`);
    revalidatePath(`/portal/tickets/${id}`);
  }
}

// A ticket the caller may see, with the project owner who gets notified
export async function visibleTicket(actor: Actor, id: string) {
  const [row] = await db
    .select({ ticket: schema.tickets, ownerId: schema.projects.ownerId })
    .from(schema.tickets)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.tickets.projectId))
    .where(and(eq(schema.tickets.id, id), actor.role === "client" ? eq(schema.tickets.clientId, actor.clientId ?? "") : undefined));
  if (!row) throw missing("تیکت پیدا نشد");
  return row;
}

export async function openTicket(actor: Actor, raw: unknown) {
  if (actor.role !== "client" || !actor.clientId) throw new OpsError("forbidden", "تیکت را مشتری ثبت می‌کند", 403);
  const clientId = actor.clientId;
  const input = parseInput(ticketInput, raw);
  let ownerId: string | null = null;
  if (input.projectId) {
    const [p] = await db
      .select({ ownerId: schema.projects.ownerId })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.clientId, clientId)));
    if (!p) throw fieldError("projectId", "پروژه پیدا نشد");
    ownerId = p.ownerId;
  }
  const ticket = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(schema.tickets)
      .values({ clientId, projectId: input.projectId ?? null, title: input.title, priority: input.priority, createdBy: actor.id })
      .returning();
    const [m] = await tx.insert(schema.ticketMessages).values({ ticketId: t.id, userId: actor.id, body: input.body }).returning({ id: schema.ticketMessages.id });
    await claimAttachments(actor, input.fileIds, clientId, m.id, tx);
    return t;
  });
  await notifyTeam({ title: `تیکت جدید #${ticket.number}: ${input.title}`, body: input.body, href: `/tickets/${ticket.id}` }, [ownerId]);
  revalidateTicket();
  return ticket;
}

// A team reply marks the ticket answered and tells the client; a client
// message reopens it and puts it back in the team's queue
export async function postMessage(actor: Actor, ticketId: string, raw: unknown) {
  const input = parseInput(messageInput, raw);
  if (!input.body && input.fileIds.length === 0) throw fieldError("body", actor.role === "client" ? "متن پیام را بنویسید" : "متن پاسخ را بنویسید");
  const { ticket, ownerId } = await visibleTicket(actor, ticketId);
  const fromClient = actor.role === "client";
  const status: TicketStatus = fromClient ? "open" : "answered";
  const message = await db.transaction(async (tx) => {
    const [m] = await tx.insert(schema.ticketMessages).values({ ticketId, userId: actor.id, body: input.body }).returning();
    await claimAttachments(actor, input.fileIds, ticket.clientId, m.id, tx);
    await tx.update(schema.tickets).set({ status, updatedAt: new Date() }).where(eq(schema.tickets.id, ticketId));
    return m;
  });
  const text = input.body || "یک فایل پیوست شد";
  if (fromClient) {
    await notifyTeam({ title: `پیام مشتری در تیکت #${ticket.number}: ${ticket.title}`, body: text, href: `/tickets/${ticketId}` }, [ownerId]);
  } else {
    await notifyClient(ticket.clientId, { title: `پاسخ تیم به تیکت «${ticket.title}»`, body: text, href: `/portal/tickets/${ticketId}` }, { sms: true });
  }
  revalidateTicket(ticketId);
  return { ...message, status };
}

// The team opens and closes tickets; a client can only close their own
export async function setTicketStatus(actor: Actor, ticketId: string, status: TicketStatus) {
  if (status !== "open" && status !== "closed") throw fieldError("status", "وضعیت معتبر نیست");
  if (actor.role === "client" && status !== "closed") throw new OpsError("forbidden", "برای باز کردن دوباره، پیام تازه بفرستید", 403);
  const { ticket } = await visibleTicket(actor, ticketId);
  if (ticket.status === status) return ticket;
  const [updated] = await db.update(schema.tickets).set({ status, updatedAt: new Date() }).where(eq(schema.tickets.id, ticketId)).returning();
  await audit(actor.id, status === "closed" ? "close" : "reopen", "ticket", ticketId);
  revalidateTicket(ticketId);
  return updated;
}

export type TicketAttachment = { id: string; name: string; size: number; mime: string };

// The conversation, oldest first, each message with its attachments
export async function ticketMessages(ticketId: string) {
  const messages = await db
    .select({
      id: schema.ticketMessages.id,
      body: schema.ticketMessages.body,
      createdAt: schema.ticketMessages.createdAt,
      authorId: schema.ticketMessages.userId,
      author: schema.users.name,
      authorRole: schema.users.role,
    })
    .from(schema.ticketMessages)
    .leftJoin(schema.users, eq(schema.users.id, schema.ticketMessages.userId))
    .where(eq(schema.ticketMessages.ticketId, ticketId))
    .orderBy(asc(schema.ticketMessages.createdAt));
  const files = messages.length
    ? await db
        .select({ id: schema.files.id, name: schema.files.name, size: schema.files.size, mime: schema.files.mime, messageId: schema.files.ticketMessageId })
        .from(schema.files)
        .where(inArray(schema.files.ticketMessageId, messages.map((m) => m.id)))
        .orderBy(asc(schema.files.createdAt))
    : [];
  return messages.map((m) => ({
    ...m,
    attachments: files.filter((f) => f.messageId === m.id).map((f): TicketAttachment => ({ id: f.id, name: f.name, size: f.size, mime: f.mime })),
  }));
}
