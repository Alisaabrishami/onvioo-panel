import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { CONTRACT_STATUS_LABELS } from "@/lib/contracts";
import { createContract } from "@/lib/ops/contracts";
import { authed, created, enumParam, forbidden, page, rawBody, uuidParam } from "@/lib/api/http";
import { contractView } from "@/lib/api/contracts";

// Admin: all contracts, ?clientId= ?status=. Client: those sent to them. Staff: 403
export const GET = authed(async (user, request) => {
  if (user.role === "staff") throw forbidden();
  const { limit, offset } = page(request);
  const status = enumParam(request, "status", schema.contractStatusEnum.enumValues);
  const client = user.role === "client";
  const clientId = client ? user.clientId : uuidParam(request, "clientId");
  const rows = await db
    .select({
      id: schema.contracts.id,
      title: schema.contracts.title,
      status: schema.contracts.status,
      amount: schema.contracts.amount,
      startsOn: schema.contracts.startsOn,
      endsOn: schema.contracts.endsOn,
      clientId: schema.contracts.clientId,
      clientName: schema.clients.name,
      sentAt: schema.contracts.sentAt,
      signedAt: schema.contracts.signedAt,
      createdAt: schema.contracts.createdAt,
    })
    .from(schema.contracts)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clientId))
    .where(
      and(
        clientId ? eq(schema.contracts.clientId, clientId) : undefined,
        client ? inArray(schema.contracts.status, ["sent", "signed"]) : undefined,
        status ? eq(schema.contracts.status, status) : undefined,
      ),
    )
    .orderBy(desc(schema.contracts.createdAt))
    .limit(limit)
    .offset(offset);
  return { items: rows.map((c) => ({ ...c, statusLabel: CONTRACT_STATUS_LABELS[c.status] })) };
});

// Admin drafts a contract: { clientId, title, body, amount?, startsOn?, endsOn? }
export const POST = authed(async (user, request) => created(contractView(user, await createContract(user, await rawBody(request)))), ["admin"]);
