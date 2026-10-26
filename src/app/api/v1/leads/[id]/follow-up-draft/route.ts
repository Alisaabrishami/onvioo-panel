import { draftFollowUp } from "@/lib/ops/crm";
import { TEAM, authed, idParam } from "@/lib/api/http";

// A Persian follow-up message written by AI from the lead's history (503 without an AI key)
export const POST = authed<RouteContext<"/api/v1/leads/[id]/follow-up-draft">>(
  async (user, _request, ctx) => ({ message: await draftFollowUp(user, idParam((await ctx.params).id)) }),
  TEAM,
);
