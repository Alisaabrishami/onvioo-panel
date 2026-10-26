import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { type ApiUser, clientOf, notFound } from "./http";

// One content item the caller may see: any for the team, a client's own
// started work (never bare ideas) for a client login
export async function visibleContent(user: ApiUser, id: string) {
  const [content] = await db
    .select()
    .from(schema.contents)
    .where(
      and(
        eq(schema.contents.id, id),
        user.role === "client" ? and(eq(schema.contents.clientId, clientOf(user)), ne(schema.contents.stage, "idea")) : undefined,
      ),
    );
  if (!content) throw notFound();
  return content;
}
