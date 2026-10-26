import { eq } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import { TICKET_STATUS_LABELS } from "@/lib/services";
import { setTicketStatus, ticketMessages, visibleTicket } from "@/lib/ops/tickets";
import { authed, body, idParam } from "@/lib/api/http";

// The ticket with its conversation. Clients see the team as "پشتیبانی Onvioo".
export const GET = authed<RouteContext<"/api/v1/tickets/[id]">>(async (user, _request, ctx) => {
  const { ticket } = await visibleTicket(user, idParam((await ctx.params).id));
  const [[names], messages] = await Promise.all([
    db
      .select({ clientName: schema.clients.name, projectTitle: schema.projects.title })
      .from(schema.tickets)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.tickets.clientId))
      .leftJoin(schema.projects, eq(schema.projects.id, schema.tickets.projectId))
      .where(eq(schema.tickets.id, ticket.id)),
    ticketMessages(ticket.id),
  ]);
  const client = user.role === "client";
  return {
    ...ticket,
    ...names,
    statusLabel: TICKET_STATUS_LABELS[ticket.status],
    messages: messages.map(({ authorId, ...m }) => ({
      ...m,
      mine: authorId === user.id,
      author: client && m.authorRole !== "client" ? "پشتیبانی Onvioo" : m.author,
    })),
  };
});

// { status: "open" | "closed" }. Clients can only close.
export const PATCH = authed<RouteContext<"/api/v1/tickets/[id]">>(async (user, request, ctx) => {
  const { status } = await body(request, z.object({ status: z.enum(["open", "closed"], { error: "وضعیت باید open یا closed باشد" }) }));
  const ticket = await setTicketStatus(user, idParam((await ctx.params).id), status);
  return { ...ticket, statusLabel: TICKET_STATUS_LABELS[ticket.status] };
});
