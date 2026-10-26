import { postMessage } from "@/lib/ops/tickets";
import { authed, created, rawBody, idParam } from "@/lib/api/http";

// { body, fileIds? }. A team reply marks the ticket answered and texts the
// client; a client message reopens it for the team.
export const POST = authed<RouteContext<"/api/v1/tickets/[id]/messages">>(async (user, request, ctx) => {
  const input = await rawBody(request);
  return created(await postMessage(user, idParam((await ctx.params).id), input));
});
