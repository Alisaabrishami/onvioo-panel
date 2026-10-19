import "server-only";
import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ContentStage } from "@/db/schema";
import { REVIEW_TASK_KEY, autoTaskFor } from "./content";

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
        assigneeId: auto.key === REVIEW_TASK_KEY ? await reviewerId(tx, content.assigneeId) : content.assigneeId,
        dueAt: content.dueAt,
        createdBy: userId,
      });
    }
    return true;
  });
}

// The longest-standing active admin reviews; with no admin the editor does
async function reviewerId(tx: Tx, fallback: string | null): Promise<string | null> {
  const [admin] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true)))
    .orderBy(asc(schema.users.createdAt))
    .limit(1);
  return admin?.id ?? fallback;
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
