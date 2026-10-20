import { signContract } from "@/lib/ops/contracts";
import { CLIENT, authed, idParam, origin, rawBody } from "@/lib/api/http";
import { contractView } from "@/lib/api/contracts";

// { signerName, code, agree: true }. Keeps the phone, address, app and a hash
// of the exact text as evidence.
export const POST = authed<RouteContext<"/api/v1/contracts/[id]/sign">>(
  async (user, request, ctx) => contractView(user, await signContract(user, idParam((await ctx.params).id), await rawBody(request), origin(request))),
  CLIENT,
);
