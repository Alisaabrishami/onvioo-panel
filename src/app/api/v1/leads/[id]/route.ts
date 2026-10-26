import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ACTIVITY_LABELS, LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, followUpState } from "@/lib/crm";
import { tehranDay } from "@/lib/growth";
import { deleteLead, getLead, leadActivities, updateLead } from "@/lib/ops/crm";
import { TEAM, authed, idParam, rawBody } from "@/lib/api/http";

type Ctx = RouteContext<"/api/v1/leads/[id]">;

// The lead with its history, newest first
export const GET = authed<Ctx>(async (user, _request, ctx) => {
  const lead = await getLead(user, idParam((await ctx.params).id));
  const [owner] = lead.ownerId ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, lead.ownerId)) : [];
  const activities = await leadActivities(lead.id);
  return {
    ...lead,
    ownerName: owner?.name ?? null,
    stageLabel: LEAD_STAGE_LABELS[lead.stage],
    sourceLabel: LEAD_SOURCE_LABELS[lead.source],
    followUp: followUpState(lead.nextFollowUp, tehranDay(), lead.stage),
    activities: activities.map((a) => ({ ...a, kindLabel: ACTIVITY_LABELS[a.kind] })),
  };
}, TEAM);

// Send the whole lead, as for POST /leads
export const PATCH = authed<Ctx>(async (user, request, ctx) => updateLead(user, idParam((await ctx.params).id), await rawBody(request)), TEAM);

export const DELETE = authed<Ctx>(async (user, _request, ctx) => {
  await deleteLead(user, idParam((await ctx.params).id));
  return {};
}, ["admin"]);
