import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { notifyTeam } from "./notify";
import { moveContentStage } from "./pipeline";

type Reviewer = { id: string; name: string; clientId: string };
export type ReviewContent = typeof schema.contents.$inferSelect;

// The client's own content only, and never ideas the team has not started
export async function ownContent(contentId: string, clientId: string): Promise<ReviewContent | null> {
  const [content] = await db
    .select()
    .from(schema.contents)
    .where(and(eq(schema.contents.id, contentId), eq(schema.contents.clientId, clientId), ne(schema.contents.stage, "idea")));
  return content ?? null;
}

function revalidate(contentId: string) {
  revalidatePath(`/portal/content/${contentId}`);
  revalidatePath("/portal");
}

// Shared by the portal and the Bale/Telegram bot
export async function approveAsClient(user: Reviewer, content: ReviewContent): Promise<void> {
  await moveContentStage(content.id, "ready", user.id);
  await audit(user.id, "approve", "content", content.id);
  await notifyTeam(
    { title: `مشتری «${content.title}» را تأیید کرد`, body: `تأیید توسط ${user.name}`, href: `/content/${content.id}` },
    [content.assigneeId],
  );
  revalidate(content.id);
}

// Sends the content back to editing with the client's notes as a comment
export async function requestChangesAsClient(user: Reviewer, content: ReviewContent, body: string, timecode: number | null): Promise<void> {
  await db.insert(schema.contentComments).values({ contentId: content.id, userId: user.id, body, timecode });
  await moveContentStage(content.id, "editing", user.id);
  await audit(user.id, "request_changes", "content", content.id);
  await notifyTeam({ title: `مشتری برای «${content.title}» اصلاحیه خواست`, body, href: `/content/${content.id}` }, [content.assigneeId]);
  revalidate(content.id);
}
