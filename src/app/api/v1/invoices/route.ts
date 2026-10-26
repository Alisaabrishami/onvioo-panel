import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { invoiceLabel } from "@/lib/invoices-data";
import { appUrl } from "@/lib/payment";
import { ApiError, authed, forbidden, page, query, uuidParam, clientOf } from "@/lib/api/http";

// Client: their sent and paid invoices with a pay link. Admin: all, ?clientId= ?status=
export const GET = authed(async (user, request) => {
  if (user.role === "staff") throw forbidden();
  const q = query(request);
  const { limit, offset } = page(request);
  const clientId = uuidParam(request, "clientId");
  const status = q.get("status");
  if (status && !schema.invoiceStatusEnum.enumValues.includes(status as never)) throw new ApiError(422, "invalid", "وضعیت معتبر نیست");
  const client = user.role === "client";
  const rows = await db
    .select({ invoice: schema.invoices, clientName: schema.clients.name })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(
      and(
        client ? and(eq(schema.invoices.clientId, clientOf(user)), inArray(schema.invoices.status, ["sent", "paid"])) : clientId ? eq(schema.invoices.clientId, clientId) : undefined,
        status ? eq(schema.invoices.status, status as never) : undefined,
      ),
    )
    .orderBy(desc(schema.invoices.issuedOn), desc(schema.invoices.number))
    .limit(limit)
    .offset(offset);
  return {
    items: rows
      .map(({ invoice: { payToken, createdBy, transactionId, ...inv }, clientName }) => ({
        ...inv,
        label: invoiceLabel(inv.number),
        clientName,
        payUrl: inv.status === "sent" ? `${appUrl()}/pay/${payToken}` : null,
        ...(client ? {} : { createdBy, transactionId }),
      })),
  };
});
