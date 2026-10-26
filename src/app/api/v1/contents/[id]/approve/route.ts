import { approveAsClient } from "@/lib/client-review";
import { ApiError, CLIENT, authed, idParam } from "@/lib/api/http";
import { visibleContent } from "@/lib/api/contents";

export const POST = authed<RouteContext<"/api/v1/contents/[id]/approve">>(async (user, _request, ctx) => {
  const content = await visibleContent(user, idParam((await ctx.params).id));
  if (content.stage !== "client_review") throw new ApiError(409, "not_waiting", "این محتوا دیگر منتظر بررسی شما نیست");
  await approveAsClient({ id: user.id, name: user.name, clientId: content.clientId }, content);
  return { id: content.id, stage: "ready" };
}, CLIENT);
