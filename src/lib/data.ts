import "server-only";
import { and, asc, desc, eq, gte, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatJalaliDate } from "./format";

export type Option = { id: string; name: string };

export function teamOptions(): Promise<Option[]> {
  return db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(and(ne(schema.users.role, "client"), eq(schema.users.active, true)))
    .orderBy(asc(schema.users.name));
}

export function clientOptions(): Promise<Option[]> {
  return db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(ne(schema.clients.status, "ended"))
    .orderBy(asc(schema.clients.name));
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Recent and upcoming shoots, labelled with their date, for pickers
export async function shootOptions(includeId?: string | null): Promise<Option[]> {
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const rows = await db
    .select({ id: schema.shoots.id, title: schema.shoots.title, startsAt: schema.shoots.startsAt, client: schema.clients.name })
    .from(schema.shoots)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.shoots.clientId))
    .where(includeId ? or(gte(schema.shoots.startsAt, since), eq(schema.shoots.id, includeId)) : gte(schema.shoots.startsAt, since))
    .orderBy(desc(schema.shoots.startsAt));
  return rows.map((s) => ({ id: s.id, name: `${formatJalaliDate(s.startsAt)} · ${s.client} · ${s.title}` }));
}
