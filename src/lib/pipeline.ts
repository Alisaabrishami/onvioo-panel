import "server-only";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ContentStage } from "@/db/schema";
import { autoTaskFor } from "./content";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Moves content to a stage, records the change and keeps the pipeline's
// automatic tasks in step. Returns false when the content does not exist.
export async function moveContentStage(
  contentId: string,
  to: ContentStage,
  userId: string | null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [content] = await tx
      .select()
      .from(schema.contents)
      .where(eq(schema.contents.id, contentId))
      .for("update");
    if (!content) return false;
    if (content.stage === to) return true;

    await tx
      .update(schema.contents)
      .set({ stage: to, updatedAt: new Date() })
      .where(eq(schema.contents.id, contentId));
    await tx
      .insert(schema.contentEvents)
      .values({ contentId, userId, fromStage: content.stage, toStage: to });

    await closeStageTasks(tx, contentId);
    const auto = autoTaskFor(to, content.stage, content.title);
    if (auto) {
      await tx.insert(schema.tasks).values({
        title: auto.title,
        autoKey: auto.key,
        contentId,
        clientId: content.clientId,
        assigneeId: content.assigneeId,
        dueAt: content.dueAt,
        createdBy: userId,
      });
    }
    return true;
  });
}

async function closeStageTasks(tx: Tx, contentId: string) {
  await tx
    .update(schema.tasks)
    .set({ status: "done", completedAt: new Date() })
    .where(
      and(
        eq(schema.tasks.contentId, contentId),
        ne(schema.tasks.status, "done"),
        // Only tasks the pipeline opened; hand-made tasks stay as they are
        isNotNull(schema.tasks.autoKey),
      ),
    );
}
