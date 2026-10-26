import * as z from "zod";
import { schema } from "@/db";
import { LEAD_STAGE_LABELS } from "@/lib/crm";
import { moveLead } from "@/lib/ops/crm";
import { TEAM, authed, body, idParam } from "@/lib/api/http";

// { stage, reason? }; moving to "lost" needs a reason
export const POST = authed<RouteContext<"/api/v1/leads/[id]/stage">>(async (user, request, ctx) => {
  const input = await body(request, z.object({ stage: z.enum(schema.leadStageEnum.enumValues, { error: "مرحله معتبر نیست" }), reason: z.string().max(1000).optional() }));
  const lead = await moveLead(user, idParam((await ctx.params).id), input.stage, input.reason);
  return { ...lead, stageLabel: LEAD_STAGE_LABELS[lead.stage] };
}, TEAM);
