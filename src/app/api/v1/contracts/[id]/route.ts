import { deleteContract, updateContract, visibleContract } from "@/lib/ops/contracts";
import { authed, idParam, rawBody } from "@/lib/api/http";
import { contractView } from "@/lib/api/contracts";

type Ctx = RouteContext<"/api/v1/contracts/[id]">;

export const GET = authed<Ctx>(async (user, _request, ctx) => contractView(user, await visibleContract(user, idParam((await ctx.params).id))));

// Only a draft changes; send the whole contract
export const PATCH = authed<Ctx>(async (user, request, ctx) => contractView(user, await updateContract(user, idParam((await ctx.params).id), await rawBody(request))), ["admin"]);

// Only a draft is deleted; signed contracts are records
export const DELETE = authed<Ctx>(async (user, _request, ctx) => {
  await deleteContract(user, idParam((await ctx.params).id));
  return {};
}, ["admin"]);
