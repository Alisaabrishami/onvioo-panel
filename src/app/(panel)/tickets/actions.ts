"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { notifyClient } from "@/lib/notify";

function revalidateTicket(id: string) {
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/portal/tickets");
  revalidatePath(`/portal/tickets/${id}`);
}

export async function replyTicket(ticketId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { errors: { body: ["متن پاسخ را بنویسید"] } };
  const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId));
  if (!ticket) return { message: "تیکت پیدا نشد" };
  await db.transaction(async (tx) => {
    await tx.insert(schema.ticketMessages).values({ ticketId, userId: user.id, body });
    await tx.update(schema.tickets).set({ status: "answered", updatedAt: new Date() }).where(eq(schema.tickets.id, ticketId));
  });
  await notifyClient(ticket.clientId, { title: `پاسخ تیم به تیکت «${ticket.title}»`, body, href: `/portal/tickets/${ticketId}` }, { sms: true });
  revalidateTicket(ticketId);
  return { ok: true };
}

export async function setTicketStatus(ticketId: string, status: "open" | "closed"): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(ticketId) || (status !== "open" && status !== "closed")) return;
  await db.update(schema.tickets).set({ status, updatedAt: new Date() }).where(eq(schema.tickets.id, ticketId));
  await audit(user.id, status === "closed" ? "close" : "reopen", "ticket", ticketId);
  revalidateTicket(ticketId);
}
