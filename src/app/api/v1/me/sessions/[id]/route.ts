import { revokeSession } from "@/lib/ops/sessions";
import { authed } from "@/lib/api/http";

// Signs out one browser or app by its id from GET /me/sessions
export const DELETE = authed<RouteContext<"/api/v1/me/sessions/[id]">>(async (user, _request, ctx) => {
  await revokeSession(user.id, (await ctx.params).id);
  return {};
});
