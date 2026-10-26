import * as z from "zod";
import { withdrawContract } from "@/lib/ops/contracts";
import { authed, body, idParam } from "@/lib/api/http";
import { contractView } from "@/lib/api/contracts";

// { to: "draft" } pulls a sent contract back for edits; { to: "cancelled" } cancels it
export const POST = authed<RouteContext<"/api/v1/contracts/[id]/withdraw">>(async (user, request, ctx) => {
  const { to } = await body(request, z.object({ to: z.enum(["draft", "cancelled"], { error: "to باید draft یا cancelled باشد" }) }));
  return contractView(user, await withdrawContract(user, idParam((await ctx.params).id), to));
}, ["admin"]);
