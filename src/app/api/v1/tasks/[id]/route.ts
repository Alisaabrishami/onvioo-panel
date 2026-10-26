import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { TEAM, authed, body, idParam, notFound } from "@/lib/api/http";

// Same rule as the panel: any team member can move any task
export const PATCH = authed<RouteContext<"/api/v1/tasks/[id]">>(async (user, request, ctx) => {
  const id = idParam((await ctx.params).id);
  const { status } = await body(request, z.object({ status: z.enum(schema.taskStatusEnum.enumValues, { error: "وضعیت معتبر نیست" }) }));
  const [task] = await db
    .update(schema.tasks)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(eq(schema.tasks.id, id))
    .returning();
  if (!task) throw notFound();
  await audit(user.id, "status", "task", id, { status, via: "api" });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return task;
}, TEAM);
