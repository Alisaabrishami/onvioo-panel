"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, invalid, optionalUuid } from "@/lib/forms";
import { notifyTeam } from "@/lib/notify";

const ticketSchema = z.object({
  title: z.string().trim().min(3, { error: "موضوع را بنویسید" }).max(200),
  body: z.string().trim().min(5, { error: "توضیح بیشتری بنویسید" }),
  projectId: optionalUuid,
  priority: z.enum(["normal", "high", "urgent"]),
});

async function projectOwner(projectId: string | null, clientId: string) {
  if (!projectId) return { ok: true, ownerId: null };
  const [p] = await db
    .select({ ownerId: schema.projects.ownerId })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.clientId, clientId)));
  return p ? { ok: true, ownerId: p.ownerId } : { ok: false, ownerId: null };
}

export async function createTicket(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  const parsed = ticketSchema.safeParse({
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    projectId: formData.get("projectId") ?? "",
    priority: formData.get("priority") ?? "normal",
  });
  if (!parsed.success) return invalid(parsed.error, formData);
  const { title, body, projectId, priority } = parsed.data;
  const project = await projectOwner(projectId, user.clientId);
  if (!project.ok) return { errors: { projectId: ["پروژه پیدا نشد"] } };

  const ticket = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(schema.tickets)
      .values({ clientId: user.clientId, projectId, title, priority, createdBy: user.id })
      .returning({ id: schema.tickets.id, number: schema.tickets.number });
    await tx.insert(schema.ticketMessages).values({ ticketId: t.id, userId: user.id, body });
    return t;
  });
  await notifyTeam({ title: `تیکت جدید #${ticket.number}: ${title}`, body, href: `/tickets/${ticket.id}` }, [project.ownerId]);
  revalidatePath("/tickets");
  redirect(`/portal/tickets/${ticket.id}`);
}

async function ownTicket(ticketId: string, clientId: string) {
  if (!isUuid(ticketId)) return null;
  const [t] = await db
    .select({ ticket: schema.tickets, ownerId: schema.projects.ownerId })
    .from(schema.tickets)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.tickets.projectId))
    .where(and(eq(schema.tickets.id, ticketId), eq(schema.tickets.clientId, clientId)));
  return t ?? null;
}

export async function replyAsClient(ticketId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { errors: { body: ["متن پیام را بنویسید"] } };
  const row = await ownTicket(ticketId, user.clientId);
  if (!row) return { message: "تیکت پیدا نشد" };
  await db.transaction(async (tx) => {
    await tx.insert(schema.ticketMessages).values({ ticketId, userId: user.id, body });
    // A client message reopens a closed ticket and puts it back in the team's queue
    await tx.update(schema.tickets).set({ status: "open", updatedAt: new Date() }).where(eq(schema.tickets.id, ticketId));
  });
  await notifyTeam({ title: `پیام مشتری در تیکت #${row.ticket.number}: ${row.ticket.title}`, body, href: `/tickets/${ticketId}` }, [row.ownerId]);
  revalidatePath(`/portal/tickets/${ticketId}`);
  revalidatePath("/portal/tickets");
  revalidatePath("/tickets");
  return { ok: true };
}

export async function closeOwnTicket(ticketId: string): Promise<void> {
  const user = await requireClient();
  const row = await ownTicket(ticketId, user.clientId);
  if (!row) return;
  await db.update(schema.tickets).set({ status: "closed", updatedAt: new Date() }).where(eq(schema.tickets.id, ticketId));
  revalidatePath(`/portal/tickets/${ticketId}`);
  revalidatePath("/portal/tickets");
  revalidatePath("/tickets");
}
