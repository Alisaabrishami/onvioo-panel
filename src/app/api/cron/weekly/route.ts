import { and, eq, gte, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { aiConfigured } from "@/lib/ai";
import { cronAuthorized } from "@/lib/cron";
import { addDays, tehranDay } from "@/lib/growth";
import { weeklyReport } from "@/lib/growth-ai";
import { notifyTeam } from "@/lib/notify";

// Weekly (Saturday morning): a draft report per active client with recent
// stats; the team reviews each one and shares it from the growth page
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!aiConfigured()) return Response.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });

  const withStats = await db
    .selectDistinct({ clientId: schema.igAccounts.clientId })
    .from(schema.igAccounts)
    .innerJoin(schema.igDailyStats, eq(schema.igDailyStats.accountId, schema.igAccounts.id))
    .innerJoin(schema.clients, eq(schema.clients.id, schema.igAccounts.clientId))
    .where(and(eq(schema.igAccounts.kind, "own"), gte(schema.igDailyStats.day, addDays(tehranDay(), -8)), ne(schema.clients.status, "ended")));

  const made: string[] = [];
  const failed: string[] = [];
  for (const { clientId } of withStats) {
    try {
      await weeklyReport(clientId, null);
      made.push(clientId);
    } catch (error) {
      console.error("[cron] weekly report failed", clientId, error);
      failed.push(clientId);
    }
  }
  if (made.length) {
    const names = await db.select({ name: schema.clients.name }).from(schema.clients).where(inArray(schema.clients.id, made));
    await notifyTeam({
      title: `گزارش هفتگی ${made.length} مشتری آماده بازبینی است`,
      body: names.map((n) => n.name).join("، "),
      href: "/growth",
    });
  }
  return Response.json({ made: made.length, failed: failed.length });
}
