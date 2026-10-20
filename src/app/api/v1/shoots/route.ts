import { and, asc, eq, gte, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { ApiError, TEAM, authed, query } from "@/lib/api/http";

const crew = alias(schema.users, "crew");

// ?from=&to= as ISO dates; defaults to the next 14 days. ?mine=1 for my shoots only
export const GET = authed(async (user, request) => {
  const q = query(request);
  const from = q.get("from") ? new Date(q.get("from")!) : new Date(Date.now() - 86400_000);
  const to = q.get("to") ? new Date(q.get("to")!) : new Date(from.getTime() + 15 * 86400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new ApiError(422, "invalid", "تاریخ معتبر نیست");
  if (to.getTime() - from.getTime() > 93 * 86400_000) throw new ApiError(422, "invalid", "بازه حداکثر سه ماه است");
  const items = await db
    .select({
      id: schema.shoots.id,
      title: schema.shoots.title,
      startsAt: schema.shoots.startsAt,
      durationMinutes: schema.shoots.durationMinutes,
      location: schema.shoots.location,
      clientId: schema.shoots.clientId,
      clientName: schema.clients.name,
      crewId: schema.shoots.crewId,
      crewName: crew.name,
      script: schema.shoots.script,
      checklist: schema.shoots.checklist,
    })
    .from(schema.shoots)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.shoots.clientId))
    .leftJoin(crew, eq(crew.id, schema.shoots.crewId))
    .where(and(gte(schema.shoots.startsAt, from), lt(schema.shoots.startsAt, to), q.get("mine") === "1" ? eq(schema.shoots.crewId, user.id) : undefined))
    .orderBy(asc(schema.shoots.startsAt));
  return { items };
}, TEAM);
