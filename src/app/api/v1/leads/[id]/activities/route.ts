import { logActivity } from "@/lib/ops/crm";
import { TEAM, authed, created, idParam, rawBody } from "@/lib/api/http";

// { kind: note|call|message|meeting, body, nextFollowUp? }. Logged contact moves a new lead to "contacted".
export const POST = authed<RouteContext<"/api/v1/leads/[id]/activities">>(
  async (user, request, ctx) => created(await logActivity(user, idParam((await ctx.params).id), await rawBody(request))),
  TEAM,
);
