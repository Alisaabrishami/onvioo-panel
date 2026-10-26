import { visibleFile } from "@/lib/ops/uploads";
import { authed, idParam } from "@/lib/api/http";
import { fileView } from "@/lib/api/files";

// One file with viewUrl (1 hour) and downloadUrl (10 minutes)
export const GET = authed<RouteContext<"/api/v1/files/[id]">>(async (user, _request, ctx) => fileView(await visibleFile(user, idParam((await ctx.params).id))));
