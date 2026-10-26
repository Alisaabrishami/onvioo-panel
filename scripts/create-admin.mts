// Usage: pnpm create-admin "<name>" <mobile> <password>
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { normalizePhone } from "../src/lib/format";

const [name, rawPhone, password] = process.argv.slice(2);
const phone = rawPhone ? normalizePhone(rawPhone) : null;
if (!name || !phone || !password || password.length < 8) {
  console.error('Usage: pnpm create-admin "<name>" <mobile> <password (8+ chars)>');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const passwordHash = await hash(password);
const [existing] = await db.select().from(schema.users).where(eq(schema.users.phone, phone));
if (existing) {
  await db
    .update(schema.users)
    .set({ name, role: "admin", passwordHash, active: true })
    .where(eq(schema.users.id, existing.id));
  console.log(`Updated ${phone} to admin`);
} else {
  const [user] = await db
    .insert(schema.users)
    .values({ name, phone, role: "admin", passwordHash })
    .returning({ id: schema.users.id });
  await db.insert(schema.staffProfiles).values({ userId: user.id, title: "مدیر" });
  console.log(`Created admin ${phone}`);
}
await pool.end();
