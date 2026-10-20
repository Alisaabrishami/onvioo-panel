import * as z from "zod";
import { requestChangesAsClient } from "@/lib/client-review";
import { ApiError, CLIENT, authed, body, idParam } from "@/lib/api/http";
import { visibleContent } from "@/lib/api/contents";

// Sends the item back to editing with the client's note (and the second it is about)
export const POST = authed<RouteContext<"/api/v1/contents/[id]/changes">>(async (user, request, ctx) => {
  const content = await visibleContent(user, idParam((await ctx.params).id));
  const input = await body(
    request,
    z.object({ body: z.string().trim().min(1, { error: "بنویسید چه چیزی باید تغییر کند" }).max(4000), timecode: z.number().int().min(0).max(36_000).nullable().optional() }),
  );
  if (content.stage !== "client_review") throw new ApiError(409, "not_waiting", "این محتوا دیگر منتظر بررسی شما نیست");
  await requestChangesAsClient({ id: user.id, name: user.name, clientId: content.clientId }, content, input.body, input.timecode ?? null);
  return { id: content.id, stage: "editing" };
}, CLIENT);
