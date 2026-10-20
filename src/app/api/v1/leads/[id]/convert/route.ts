import { convertLead } from "@/lib/ops/crm";
import { TEAM, authed, idParam } from "@/lib/api/http";

// Turns the lead into a client (marks it won); repeat calls return the same client
export const POST = authed<RouteContext<"/api/v1/leads/[id]/convert">>(async (user, _request, ctx) => convertLead(user, idParam((await ctx.params).id)), TEAM);
