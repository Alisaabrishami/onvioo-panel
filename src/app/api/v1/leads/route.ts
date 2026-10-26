import { and, asc, desc, eq, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, OPEN_STAGES, followUpState, pipelineStats } from "@/lib/crm";
import { tehranDay } from "@/lib/growth";
import { createLead } from "@/lib/ops/crm";
import { TEAM, authed, created, enumParam, page, query, rawBody } from "@/lib/api/http";

// ?stage= (a stage, or "open") ?owner=me ?due=1 (follow-up today or overdue) ?q= (name, business, phone, Instagram).
// Also returns pipeline numbers: open count and value, wins and win rate over 90 days.
export const GET = authed(async (user, request) => {
  const q = query(request);
  const { limit, offset } = page(request);
  const stage = enumParam(request, "stage", [...schema.leadStageEnum.enumValues, "open"] as const);
  const today = tehranDay();
  const search = q.get("q")?.trim();
  const rows = await db
    .select({ lead: schema.leads, ownerName: schema.users.name })
    .from(schema.leads)
    .leftJoin(schema.users, eq(schema.users.id, schema.leads.ownerId))
    .where(
      and(
        stage === "open" ? inArray(schema.leads.stage, OPEN_STAGES) : stage ? eq(schema.leads.stage, stage) : undefined,
        q.get("owner") === "me" ? eq(schema.leads.ownerId, user.id) : undefined,
        q.get("due") === "1" ? and(isNotNull(schema.leads.nextFollowUp), lte(schema.leads.nextFollowUp, today), inArray(schema.leads.stage, OPEN_STAGES)) : undefined,
        search
          ? or(
              ilike(schema.leads.name, `%${search}%`),
              ilike(schema.leads.business, `%${search}%`),
              ilike(schema.leads.phone, `%${search}%`),
              ilike(schema.leads.instagram, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(sql`${schema.leads.nextFollowUp} asc nulls last`, desc(schema.leads.updatedAt), asc(schema.leads.name))
    .limit(limit)
    .offset(offset);
  const all = await db.select({ stage: schema.leads.stage, value: schema.leads.value, source: schema.leads.source, updatedAt: schema.leads.updatedAt }).from(schema.leads);
  const stats = pipelineStats(all, new Date(Date.now() - 90 * 86400_000));
  return {
    items: rows.map(({ lead, ownerName }) => ({
      ...lead,
      ownerName,
      stageLabel: LEAD_STAGE_LABELS[lead.stage],
      sourceLabel: LEAD_SOURCE_LABELS[lead.source],
      followUp: followUpState(lead.nextFollowUp, today, lead.stage),
    })),
    stats: { ...stats, bySource: Object.fromEntries(stats.bySource) },
  };
}, TEAM);

// { name, business?, phone?, instagram?, source?, value?, services?, ownerId?, nextFollowUp?, notes? }
export const POST = authed(async (user, request) => created(await createLead(user, await rawBody(request))), TEAM);
