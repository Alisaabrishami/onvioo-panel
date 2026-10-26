import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type PaymentSettings = { accountId: string | null; taxBp: number; dueDays: number };

type Settings = { payment: PaymentSettings };
const DEFAULTS: Settings = { payment: { accountId: null, taxBp: 0, dueDays: 7 } };

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key));
  return { ...DEFAULTS[key], ...((row?.value as Partial<Settings[K]>) ?? {}) };
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db
    .insert(schema.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
}
