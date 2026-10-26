import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { TICKET_STATUS_LABELS } from "@/lib/services";
import { openTicket } from "@/lib/ops/tickets";
import { CLIENT, authed, created, rawBody, enumParam, page, uuidParam } from "@/lib/api/http";

// Team: every client's tickets, ?status= (open, answered, closed, active) ?clientId=.
// Client: their own.
export const GET = authed(async (user, request) => {
  const { limit, offset } = page(request);
  const status = enumParam(request, "status", ["open", "answered", "closed", "active"] as const);
  const clientId = user.role === "client" ? user.clientId : uuidParam(request, "clientId");
  const rows = await db
    .select({
      id: schema.tickets.id,
      number: schema.tickets.number,
      title: schema.tickets.title,
      status: schema.tickets.status,
      priority: schema.tickets.priority,
      clientId: schema.tickets.clientId,
      clientName: schema.clients.name,
      projectId: schema.tickets.projectId,
      projectTitle: schema.projects.title,
      createdAt: schema.tickets.createdAt,
      updatedAt: schema.tickets.updatedAt,
    })
    .from(schema.tickets)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.tickets.clientId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.tickets.projectId))
    .where(
      and(
        clientId ? eq(schema.tickets.clientId, clientId) : undefined,
        status === "active" ? ne(schema.tickets.status, "closed") : status ? eq(schema.tickets.status, status) : undefined,
      ),
    )
    .orderBy(desc(schema.tickets.updatedAt))
    .limit(limit)
    .offset(offset);
  return { items: rows.map((t) => ({ ...t, statusLabel: TICKET_STATUS_LABELS[t.status] })) };
});

// A client opens a ticket; attach files uploaded through /uploads by id
export const POST = authed(async (user, request) => {
  const input = await rawBody(request);
  return created(await openTicket(user, input));
}, CLIENT);
