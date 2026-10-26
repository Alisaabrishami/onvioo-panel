import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { TEAM, authed, query } from "@/lib/api/http";

// ?status=active (default) or all; for pickers like clock-in and new task
export const GET = authed(async (_user, request) => {
  const all = query(request).get("status") === "all";
  const items = await db
    .select({ id: schema.clients.id, name: schema.clients.name, brand: schema.clients.brand, instagram: schema.clients.instagram, status: schema.clients.status })
    .from(schema.clients)
    .where(all ? undefined : eq(schema.clients.status, "active"))
    .orderBy(asc(schema.clients.name));
  return { items };
}, TEAM);
