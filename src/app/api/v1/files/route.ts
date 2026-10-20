import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, enumParam, page, uuidParam } from "@/lib/api/http";
import { fileView } from "@/lib/api/files";

// Team: all files, ?clientId= ?contentId= ?kind=. Client: their account's
// files without raw footage. Finance receipts are left out for everyone but the admin.
export const GET = authed(async (user, request) => {
  const { limit, offset } = page(request);
  const client = user.role === "client";
  const clientId = client ? user.clientId : uuidParam(request, "clientId");
  const contentId = uuidParam(request, "contentId");
  const kind = enumParam(request, "kind", schema.fileKindEnum.enumValues);
  const rows = await db
    .select({ file: schema.files })
    .from(schema.files)
    .leftJoin(schema.transactions, eq(schema.transactions.receiptFileId, schema.files.id))
    .where(
      and(
        clientId ? eq(schema.files.clientId, clientId) : undefined,
        contentId ? eq(schema.files.contentId, contentId) : undefined,
        kind ? eq(schema.files.kind, kind) : undefined,
        client ? ne(schema.files.kind, "raw") : undefined,
        user.role === "admin" ? undefined : isNull(schema.transactions.id),
      ),
    )
    .orderBy(desc(schema.files.createdAt))
    .limit(limit)
    .offset(offset);
  return { items: await Promise.all(rows.map((r) => fileView(r.file, false))) };
});
