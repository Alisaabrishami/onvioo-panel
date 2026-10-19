import "server-only";
import { db, schema } from "@/db";

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.auditLog).values({ userId, action, entity, entityId, data });
}
