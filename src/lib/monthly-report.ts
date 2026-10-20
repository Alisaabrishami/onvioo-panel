import "server-only";
import { and, count, eq, gte, inArray, isNotNull, lt, notInArray, sql } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import { aiConfigured, askClaude } from "./ai";
import { performance, tehranDay } from "./growth";
import { accountsOf, dailyStats, postsOf } from "./growth-data";
import { type MonthlyReportData, type MonthlyStats, basicSummary, countByType, instagramTotals, statsForPrompt, uptimePercent } from "./monthly";
import { periodLabel, periodRange } from "./payroll";

const summarySchema = z.object({
  headline: z.string().describe("One line naming the month's main result"),
  summary: z.string().describe("A short paragraph explaining the month in plain words, for the business owner"),
  highlights: z.array(z.string()).min(1).max(6).describe("The month's concrete results, most important first"),
  nextMonth: z.array(z.string()).min(1).max(5).describe("Concrete plans or suggestions for next month"),
});

export async function collectMonthlyStats(clientId: string, period: string): Promise<MonthlyStats> {
  const { start, end } = periodRange(period);
  const startDay = tehranDay(start);
  const endDay = tehranDay(end);
  const inMonth = (column: Parameters<typeof gte>[0]) => and(gte(column, start), lt(column, end));

  const [events, inProgress, shoots, accounts, projects, ticketsOpened, ticketsClosed, checks, invoiced, paid, outstanding] = await Promise.all([
    db
      .select({ contentId: schema.contentEvents.contentId, from: schema.contentEvents.fromStage, to: schema.contentEvents.toStage, type: schema.contents.type, title: schema.contents.title })
      .from(schema.contentEvents)
      .innerJoin(schema.contents, eq(schema.contents.id, schema.contentEvents.contentId))
      .where(and(eq(schema.contents.clientId, clientId), inMonth(schema.contentEvents.createdAt))),
    db
      .select({ value: count() })
      .from(schema.contents)
      .where(and(eq(schema.contents.clientId, clientId), notInArray(schema.contents.stage, ["idea", "published"]))),
    db.select({ value: count() }).from(schema.shoots).where(and(eq(schema.shoots.clientId, clientId), inMonth(schema.shoots.startsAt))),
    accountsOf(clientId),
    db
      .select({
        id: schema.projects.id,
        title: schema.projects.title,
        status: schema.projects.status,
        done: sql<number>`count(*) filter (where ${schema.milestones.done})::int`,
        total: sql<number>`count(${schema.milestones.id})::int`,
        doneThisMonth: sql<number>`count(*) filter (where ${schema.milestones.doneAt} >= ${start} and ${schema.milestones.doneAt} < ${end})::int`,
      })
      .from(schema.projects)
      .leftJoin(schema.milestones, eq(schema.milestones.projectId, schema.projects.id))
      .where(and(eq(schema.projects.clientId, clientId), lt(schema.projects.createdAt, end)))
      .groupBy(schema.projects.id),
    db.select({ value: count() }).from(schema.tickets).where(and(eq(schema.tickets.clientId, clientId), inMonth(schema.tickets.createdAt))),
    db
      .select({ value: count() })
      .from(schema.tickets)
      .where(and(eq(schema.tickets.clientId, clientId), eq(schema.tickets.status, "closed"), inMonth(schema.tickets.updatedAt))),
    db
      .select({ ok: sql<number>`count(*) filter (where ${schema.monitorChecks.ok})::int`, total: sql<number>`count(*)::int` })
      .from(schema.monitorChecks)
      .innerJoin(schema.monitors, eq(schema.monitors.id, schema.monitorChecks.monitorId))
      .where(and(eq(schema.monitors.clientId, clientId), inMonth(schema.monitorChecks.at))),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.invoices.total}), 0)::bigint` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.clientId, clientId), inArray(schema.invoices.status, ["sent", "paid"]), gte(schema.invoices.issuedOn, startDay), lt(schema.invoices.issuedOn, endDay))),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.invoices.total}), 0)::bigint` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.clientId, clientId), eq(schema.invoices.status, "paid"), isNotNull(schema.invoices.paidAt), inMonth(schema.invoices.paidAt))),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.invoices.total}), 0)::bigint` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.clientId, clientId), eq(schema.invoices.status, "sent"))),
  ]);

  // A content item counts once even if it bounced between stages
  const published = new Map(events.filter((e) => e.to === "published").map((e) => [e.contentId, e]));
  const own = accounts.filter((a) => a.kind === "own").map((a) => a.id);
  let instagram: MonthlyStats["instagram"] = null;
  if (own.length) {
    const [days, posts] = await Promise.all([dailyStats(own, startDay), postsOf(own, start)]);
    const monthDays = days.filter((d) => d.day < endDay);
    const monthPosts = posts.filter((p) => p.postedAt < end);
    if (monthDays.length || monthPosts.length) {
      instagram = {
        ...instagramTotals(monthDays),
        posts: monthPosts.length,
        topPosts: [...monthPosts]
          .sort((a, b) => performance(b) - performance(a))
          .slice(0, 3)
          .map((p) => ({ caption: (p.caption ?? "").replace(/\s+/g, " ").slice(0, 90), views: performance(p), permalink: p.permalink })),
      };
    }
  }

  return {
    content: {
      published: published.size,
      byType: countByType([...published.values()].map((e) => e.type)),
      titles: [...published.values()].map((e) => e.title).slice(0, 20),
      approved: events.filter((e) => e.from === "client_review" && e.to === "ready").length,
      revisions: events.filter((e) => e.from === "client_review" && e.to === "editing").length,
      inProgress: inProgress[0].value,
    },
    shoots: shoots[0].value,
    instagram,
    site: {
      projects: projects
        .filter((p) => p.status !== "done" || p.doneThisMonth > 0)
        .map((p) => ({ title: p.title, status: p.status, done: p.done, total: p.total })),
      milestonesDone: projects.reduce((s, p) => s + p.doneThisMonth, 0),
      ticketsOpened: ticketsOpened[0].value,
      ticketsClosed: ticketsClosed[0].value,
      uptime: uptimePercent(checks[0]?.ok ?? 0, checks[0]?.total ?? 0),
    },
    billing: { invoiced: Number(invoiced[0].value), paid: Number(paid[0].value), outstanding: Number(outstanding[0].value) },
  };
}

// Drafts (or redrafts) one client's report; a report already sent is left alone
export async function buildMonthlyReport(clientId: string, period: string, userId: string | null): Promise<{ id: string } | { error: string }> {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) return { error: "مشتری پیدا نشد" };
  const [existing] = await db
    .select({ id: schema.monthlyReports.id, sharedAt: schema.monthlyReports.sharedAt })
    .from(schema.monthlyReports)
    .where(and(eq(schema.monthlyReports.clientId, clientId), eq(schema.monthlyReports.period, period)));
  if (existing?.sharedAt) return { error: "این گزارش قبلاً برای مشتری فرستاده شده است" };

  const stats = await collectMonthlyStats(clientId, period);
  const about = [client.name, client.brand, client.notes].filter(Boolean).join(" — ");
  const ai = aiConfigured();
  const summary = ai
    ? await askClaude({
        system: `You are the account manager of Onvioo, an Instagram content and website agency in Iran. You write the monthly report a client reads.
Write in natural, warm, concise Persian (Farsi). Use only numbers given in the data; when data is thin, say so briefly. Address the client politely (شما).`,
        prompt: `Write the monthly report for «${about}» for ${periodLabel(period)} (Jalali calendar).\n\nDATA\n${statsForPrompt(stats)}`,
        schema: summarySchema,
        toolName: "monthly_report",
        toolDescription: "Record the monthly client report.",
        maxTokens: 3000,
        mock: () => basicSummary(client.name, period, stats),
      })
    : basicSummary(client.name, period, stats);
  const data: MonthlyReportData = { stats, ai, ...summary };

  const [row] = await db
    .insert(schema.monthlyReports)
    .values({ clientId, period, data, createdBy: userId })
    .onConflictDoUpdate({
      target: [schema.monthlyReports.clientId, schema.monthlyReports.period],
      set: { data, createdBy: userId, updatedAt: new Date() },
    })
    .returning({ id: schema.monthlyReports.id });
  return { id: row.id };
}

// Clients that should get a report for this month: active, and signed up before it ended
export async function reportableClients(period: string) {
  const { end } = periodRange(period);
  return db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(and(eq(schema.clients.status, "active"), lt(schema.clients.createdAt, end)))
    .orderBy(schema.clients.name);
}
