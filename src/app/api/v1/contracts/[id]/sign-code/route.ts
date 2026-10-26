import { sendSignCode } from "@/lib/ops/contracts";
import { CLIENT, authed, idParam } from "@/lib/api/http";

// Texts the client a 6-digit code to sign with (429 when asked too often)
export const POST = authed<RouteContext<"/api/v1/contracts/[id]/sign-code">>(async (user, _request, ctx) => {
  await sendSignCode(user, idParam((await ctx.params).id));
  return { sent: true };
}, CLIENT);
