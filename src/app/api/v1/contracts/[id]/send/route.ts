import { sendContract } from "@/lib/ops/contracts";
import { authed, idParam } from "@/lib/api/http";
import { contractView } from "@/lib/api/contracts";

// Sends a draft to the client for signing; they get an SMS and a notification
export const POST = authed<RouteContext<"/api/v1/contracts/[id]/send">>(
  async (user, _request, ctx) => contractView(user, await sendContract(user, idParam((await ctx.params).id))),
  ["admin"],
);
