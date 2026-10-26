import * as z from "zod";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { moveContentStage } from "@/lib/pipeline";
import { TEAM, authed, body, idParam, notFound } from "@/lib/api/http";
import { STAGE_LABELS } from "@/lib/content";
import { revalidatePath } from "next/cache";

// Moves along the pipeline with the same side effects as the board: auto tasks, client notices
export const POST = authed<RouteContext<"/api/v1/contents/[id]/stage">>(async (user, request, ctx) => {
  const id = idParam((await ctx.params).id);
  const { stage } = await body(request, z.object({ stage: z.enum(schema.contentStageEnum.enumValues, { error: "مرحله معتبر نیست" }) }));
  if (!(await moveContentStage(id, stage, user.id))) throw notFound();
  await audit(user.id, "move", "content", id, { stage, via: "api" });
  revalidatePath("/content");
  revalidatePath(`/content/${id}`);
  return { id, stage, stageLabel: STAGE_LABELS[stage] };
}, TEAM);
