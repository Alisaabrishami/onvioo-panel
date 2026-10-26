import "server-only";
import { and, asc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { AiUnavailableError, callClaude, type ApiBlock, type ApiMessage, type ApiTool } from "./ai";
import { CATEGORY_LABELS, profitAndLoss } from "./finance";
import { transactionsBetween, periodDayRange } from "./finance-data";
import { groupForDigest } from "./follow-up";
import { followedTasks } from "./follow-up-run";
import { formatJalaliDateTime, formatToman, isoDateToJalali } from "./format";
import { tehranDay } from "./growth";
import { LEAD_STAGE_LABELS, OPEN_STAGES, followUpState } from "./crm";
import { isOverdue } from "./invoice";
import { periodLabel, periodOf } from "./payroll";
import { onLeaveToday } from "./team-data";

// The panel assistant: Claude answers questions about the agency by calling
// read-only tools over panel data. Staff never see money; nothing here writes.

export type ChatTurn = { role: "user" | "assistant"; text: string };
type Viewer = { id: string; role: Role; name: string };

type Tool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  adminOnly?: boolean;
  run: (input: z.infer<S>, viewer: Viewer) => Promise<unknown>;
};

const STAGE_FA: Record<string, string> = {
  idea: "ایده",
  shot: "ضبط شده",
  editing: "در تدوین",
  internal_review: "بازبینی داخلی",
  client_review: "بازبینی مشتری",
  ready: "آماده انتشار",
  published: "منتشر شده",
};

function tool<S extends z.ZodType>(t: Tool<S>): Tool {
  return t as unknown as Tool;
}

const empty = z.object({});

async function unpaidInvoices(clientId?: string) {
  const today = tehranDay();
  const rows = await db
    .select({ inv: schema.invoices, client: schema.clients.name })
    .from(schema.invoices)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.invoices.clientId))
    .where(and(eq(schema.invoices.status, "sent"), clientId ? eq(schema.invoices.clientId, clientId) : undefined))
    .orderBy(asc(schema.invoices.dueOn));
  return rows.map(({ inv, client }) => ({
    number: inv.number,
    client,
    title: inv.title,
    total: formatToman(inv.total),
    due: inv.dueOn ? isoDateToJalali(inv.dueOn) : null,
    overdue: isOverdue(inv, today),
  }));
}

const TOOLS: Tool[] = [
  tool({
    name: "overview",
    description: "Headline numbers for the agency right now: clients, content in each stage, open and overdue tasks, open tickets, open leads, sites down, and (for admins) unpaid invoices.",
    schema: empty,
    async run(_, viewer) {
      const now = new Date();
      const [clients, stages, tasks, tickets, leads, down] = await Promise.all([
        db.select({ n: sql<number>`count(*)::int` }).from(schema.clients).where(eq(schema.clients.status, "active")),
        db.select({ stage: schema.contents.stage, n: sql<number>`count(*)::int` }).from(schema.contents).where(ne(schema.contents.stage, "published")).groupBy(schema.contents.stage),
        db
          .select({ open: sql<number>`count(*)::int`, overdue: sql<number>`count(*) filter (where ${schema.tasks.dueAt} < ${now})::int` })
          .from(schema.tasks)
          .where(ne(schema.tasks.status, "done")),
        db.select({ n: sql<number>`count(*)::int` }).from(schema.tickets).where(eq(schema.tickets.status, "open")),
        db.select({ n: sql<number>`count(*)::int` }).from(schema.leads).where(inArray(schema.leads.stage, OPEN_STAGES)),
        db.select({ url: schema.monitors.url }).from(schema.monitors).where(and(eq(schema.monitors.active, true), eq(schema.monitors.up, false))),
      ]);
      const result: Record<string, unknown> = {
        activeClients: clients[0].n,
        contentInProgress: Object.fromEntries(stages.map((s) => [STAGE_FA[s.stage], s.n])),
        openTasks: tasks[0].open,
        overdueTasks: tasks[0].overdue,
        openTickets: tickets[0].n,
        openLeads: leads[0].n,
        sitesDown: down.map((d) => d.url),
      };
      if (viewer.role === "admin") {
        const unpaid = await unpaidInvoices();
        result.unpaidInvoices = unpaid.length;
        result.overdueInvoices = unpaid.filter((u) => u.overdue).length;
      }
      return result;
    },
  }),
  tool({
    name: "find_client",
    description: "Find clients by name, brand or Instagram handle. Returns ids to use with client_summary.",
    schema: z.object({ query: z.string().min(1).max(80) }),
    async run({ query }) {
      const q = `%${query.replace(/[%_]/g, "")}%`;
      return db
        .select({ id: schema.clients.id, name: schema.clients.name, brand: schema.clients.brand, instagram: schema.clients.instagram, status: schema.clients.status })
        .from(schema.clients)
        .where(or(ilike(schema.clients.name, q), ilike(schema.clients.brand, q), ilike(schema.clients.instagram, q)))
        .limit(8);
    },
  }),
  tool({
    name: "client_summary",
    description: "Everything open for one client: content by stage, upcoming publishes, open tasks, site projects, open tickets, site status, and (for admins) unpaid invoices. Needs an id from find_client.",
    schema: z.object({ client_id: z.uuid() }),
    async run({ client_id }, viewer) {
      const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, client_id));
      if (!client) return { error: "client not found" };
      const now = new Date();
      const [stages, upcoming, tasks, projects, tickets, monitors] = await Promise.all([
        db.select({ stage: schema.contents.stage, n: sql<number>`count(*)::int` }).from(schema.contents).where(eq(schema.contents.clientId, client_id)).groupBy(schema.contents.stage),
        db
          .select({ title: schema.contents.title, at: schema.contents.publishAt, stage: schema.contents.stage })
          .from(schema.contents)
          .where(and(eq(schema.contents.clientId, client_id), gte(schema.contents.publishAt, now)))
          .orderBy(asc(schema.contents.publishAt))
          .limit(5),
        db
          .select({ title: schema.tasks.title, dueAt: schema.tasks.dueAt, assignee: schema.users.name })
          .from(schema.tasks)
          .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
          .where(and(eq(schema.tasks.clientId, client_id), ne(schema.tasks.status, "done")))
          .orderBy(asc(schema.tasks.dueAt))
          .limit(10),
        db.select({ title: schema.projects.title, status: schema.projects.status, dueOn: schema.projects.dueOn }).from(schema.projects).where(eq(schema.projects.clientId, client_id)),
        db.select({ title: schema.tickets.title }).from(schema.tickets).where(and(eq(schema.tickets.clientId, client_id), eq(schema.tickets.status, "open"))),
        db.select({ url: schema.monitors.url, up: schema.monitors.up }).from(schema.monitors).where(eq(schema.monitors.clientId, client_id)),
      ]);
      const result: Record<string, unknown> = {
        name: client.name,
        brand: client.brand,
        status: client.status,
        content: Object.fromEntries(stages.map((s) => [STAGE_FA[s.stage], s.n])),
        upcomingPublishes: upcoming.map((u) => ({ title: u.title, at: u.at && formatJalaliDateTime(u.at), stage: STAGE_FA[u.stage] })),
        openTasks: tasks.map((t) => ({ title: t.title, assignee: t.assignee, due: t.dueAt && formatJalaliDateTime(t.dueAt), overdue: !!t.dueAt && t.dueAt < now })),
        siteProjects: projects.map((p) => ({ ...p, dueOn: p.dueOn && isoDateToJalali(p.dueOn) })),
        openTickets: tickets.map((t) => t.title),
        sites: monitors.map((m) => ({ url: m.url, status: m.up === false ? "down" : m.up ? "up" : "not checked yet" })),
      };
      if (viewer.role === "admin") result.unpaidInvoices = await unpaidInvoices(client_id);
      return result;
    },
  }),
  tool({
    name: "overdue_tasks",
    description: "Tasks past their deadline and not done. scope 'mine' limits to the person asking.",
    schema: z.object({ scope: z.enum(["mine", "all"]).default("all") }),
    async run({ scope }, viewer) {
      const rows = await db
        .select({ title: schema.tasks.title, dueAt: schema.tasks.dueAt, priority: schema.tasks.priority, assignee: schema.users.name, client: schema.clients.name })
        .from(schema.tasks)
        .leftJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
        .leftJoin(schema.clients, eq(schema.clients.id, schema.tasks.clientId))
        .where(
          and(
            ne(schema.tasks.status, "done"),
            lt(schema.tasks.dueAt, new Date()),
            scope === "mine" ? eq(schema.tasks.assigneeId, viewer.id) : undefined,
          ),
        )
        .orderBy(asc(schema.tasks.dueAt))
        .limit(25);
      return rows.map((r) => ({ ...r, dueAt: r.dueAt && formatJalaliDateTime(r.dueAt) }));
    },
  }),
  tool({
    name: "task_follow_ups",
    description:
      "Tasks the assistant follows up with staff on a manager's behalf: who is stuck (and why), who isn't answering, what is late, what is moving, and what finished in the last day. scope 'mine' limits to follow-ups the person asking started.",
    schema: z.object({ scope: z.enum(["mine", "all"]).default("mine") }),
    adminOnly: true,
    async run({ scope }, viewer) {
      const now = new Date();
      const since = new Date(now.getTime() - 24 * 3600_000);
      const g = groupForDigest(await followedTasks(scope === "mine" ? viewer.id : null, since), now, since);
      const brief = (list: typeof g.done) =>
        list.map((t) => ({ title: t.title, assignee: t.assignee, due: t.dueAt && formatJalaliDateTime(t.dueAt), note: t.checkinNote, unansweredQuestions: t.unanswered }));
      return { blocked: brief(g.blocked), notAnswering: brief(g.silent), late: brief(g.late), onTrack: brief(g.onTrack), doneLastDay: brief(g.done) };
    },
  }),
  tool({
    name: "content_schedule",
    description: "Content scheduled to publish in the next few days, with its stage, so you can spot pieces that won't be ready.",
    schema: z.object({ days: z.number().int().min(1).max(31).default(7) }),
    async run({ days }) {
      const now = new Date();
      const rows = await db
        .select({ title: schema.contents.title, at: schema.contents.publishAt, stage: schema.contents.stage, client: schema.clients.name, assignee: schema.users.name })
        .from(schema.contents)
        .innerJoin(schema.clients, eq(schema.clients.id, schema.contents.clientId))
        .leftJoin(schema.users, eq(schema.users.id, schema.contents.assigneeId))
        .where(and(gte(schema.contents.publishAt, now), lt(schema.contents.publishAt, new Date(now.getTime() + days * 86400_000))))
        .orderBy(asc(schema.contents.publishAt))
        .limit(40);
      return rows.map((r) => ({ ...r, at: r.at && formatJalaliDateTime(r.at), stage: STAGE_FA[r.stage], notReady: r.stage !== "ready" && r.stage !== "published" }));
    },
  }),
  tool({
    name: "lead_follow_ups",
    description: "Sales leads whose follow-up is overdue, today or in the next few days, plus open leads with no follow-up date.",
    schema: empty,
    async run() {
      const today = tehranDay();
      const rows = await db
        .select({ lead: schema.leads, owner: schema.users.name })
        .from(schema.leads)
        .leftJoin(schema.users, eq(schema.users.id, schema.leads.ownerId))
        .where(inArray(schema.leads.stage, OPEN_STAGES))
        .orderBy(asc(schema.leads.nextFollowUp));
      return rows
        .map(({ lead, owner }) => ({
          name: lead.name,
          business: lead.business,
          stage: LEAD_STAGE_LABELS[lead.stage],
          owner,
          followUp: lead.nextFollowUp ? isoDateToJalali(lead.nextFollowUp) : "no date",
          state: followUpState(lead.nextFollowUp, today, lead.stage) ?? (lead.nextFollowUp ? "later" : "unscheduled"),
        }))
        .filter((l) => l.state !== "later")
        .slice(0, 25);
    },
  }),
  tool({
    name: "site_status",
    description: "Every monitored client website: up or down, since when, response time, SSL and domain expiry.",
    schema: empty,
    async run() {
      const rows = await db
        .select({ m: schema.monitors, client: schema.clients.name })
        .from(schema.monitors)
        .innerJoin(schema.clients, eq(schema.clients.id, schema.monitors.clientId))
        .where(eq(schema.monitors.active, true))
        .orderBy(asc(schema.clients.name));
      return rows.map(({ m, client }) => ({
        client,
        url: m.url,
        status: m.up === false ? "down" : m.up ? "up" : "not checked yet",
        downSince: m.downSince && formatJalaliDateTime(m.downSince),
        lastMs: m.lastMs,
        sslExpires: m.sslExpiresAt && formatJalaliDateTime(m.sslExpiresAt),
        domainExpires: m.domainExpiresOn && isoDateToJalali(m.domainExpiresOn),
      }));
    },
  }),
  tool({
    name: "team_today",
    description: "Who on the team is clocked in right now (and on which client), and who is on approved leave today.",
    schema: empty,
    async run() {
      const [working, leave] = await Promise.all([
        db
          .select({ name: schema.users.name, since: schema.attendance.clockIn, client: schema.clients.name })
          .from(schema.attendance)
          .innerJoin(schema.users, eq(schema.users.id, schema.attendance.userId))
          .leftJoin(schema.clients, eq(schema.clients.id, schema.attendance.clientId))
          .where(isNull(schema.attendance.clockOut)),
        onLeaveToday(),
      ]);
      const onLeave = leave.length
        ? await db.select({ name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, leave))
        : [];
      return { working: working.map((w) => ({ ...w, since: formatJalaliDateTime(w.since) })), onLeave: onLeave.map((u) => u.name) };
    },
  }),
  tool({
    name: "unpaid_invoices",
    description: "Invoices sent to clients and not paid yet, oldest due date first, with which are overdue.",
    schema: empty,
    adminOnly: true,
    run: () => unpaidInvoices(),
  }),
  tool({
    name: "month_finance",
    description: "Income, expenses and profit for a Jalali month, broken down by category, plus the biggest paying clients. period is 'YYYY-MM' in the Jalali calendar; omit for the current month.",
    schema: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
    adminOnly: true,
    async run({ period }) {
      const p = period ?? periodOf();
      const { from, to } = periodDayRange(p);
      const txs = await transactionsBetween(from, to);
      const pl = profitAndLoss(txs);
      const byClient = new Map<string, number>();
      for (const t of txs) if (t.category === "client_payment" && t.clientId) byClient.set(t.clientId, (byClient.get(t.clientId) ?? 0) + t.amount);
      const names = byClient.size
        ? await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(inArray(schema.clients.id, [...byClient.keys()]))
        : [];
      return {
        month: periodLabel(p),
        income: formatToman(pl.income),
        expense: formatToman(pl.expense),
        profit: formatToman(pl.profit),
        byCategory: Object.fromEntries([...pl.byCategory].map(([c, v]) => [CATEGORY_LABELS[c], formatToman(v)])),
        topClients: [...byClient]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, v]) => ({ client: names.find((n) => n.id === id)?.name, paid: formatToman(v) })),
      };
    },
  }),
];

export function toolsFor(role: Role): Tool[] {
  return TOOLS.filter((t) => !t.adminOnly || role === "admin");
}

function apiTools(tools: Tool[]): ApiTool[] {
  return tools.map((t) => {
    const json = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete json.$schema;
    return { name: t.name, description: t.description, input_schema: json };
  });
}

async function runTool(tools: Tool[], name: string, input: unknown, viewer: Viewer): Promise<{ ok: boolean; content: string }> {
  const t = tools.find((x) => x.name === name);
  if (!t) return { ok: false, content: `Unknown tool ${name}` };
  const parsed = t.schema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, content: `Invalid input: ${parsed.error.message}` };
  try {
    return { ok: true, content: JSON.stringify(await t.run(parsed.data, viewer)) };
  } catch (error) {
    console.error(`assistant tool ${name} failed`, error);
    return { ok: false, content: "The tool failed while reading the data." };
  }
}

function systemPrompt(viewer: Viewer): string {
  return [
    "You are the assistant inside the Onvioo agency panel. Onvioo makes Instagram content (reels, stories) for clients and builds their websites.",
    `You are talking to ${viewer.name}, whose role is ${viewer.role === "admin" ? "admin (the agency owner)" : "staff (no access to money)"}.`,
    `Today is ${isoDateToJalali(tehranDay())} in the Jalali calendar (Tehran time).`,
    "Answer in Persian, briefly and concretely, using the tools to look up real data; never make numbers up. If a tool returns nothing, say so plainly.",
    "You can only read; if asked to change something, say which page of the panel does it.",
    "Amounts are toman. Use short lists when listing several items.",
    viewer.role === "admin" ? "" : "Do not discuss salaries, invoices or finances; you have no tools for them.",
  ]
    .filter(Boolean)
    .join("\n");
}

const MAX_ROUNDS = 6;

export async function askAssistant(history: ChatTurn[], viewer: Viewer): Promise<string> {
  const tools = toolsFor(viewer.role);
  if (process.env.AI_DRIVER === "mock") return mockAnswer(history.at(-1)?.text ?? "", tools, viewer);
  if (!process.env.ANTHROPIC_API_KEY) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");

  // Earlier turns are kept as plain text; only this turn's tool calls are replayed
  const messages: ApiMessage[] = history.map((t) => ({ role: t.role, content: t.text }));
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await callClaude({ system: systemPrompt(viewer), messages, tools: apiTools(tools) });
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "tool_use") return textOf(res.content) || "پاسخی پیدا نکردم.";
    const calls = res.content.filter((b) => b.type === "tool_use");
    const results = await Promise.all(
      calls.map(async (c) => {
        const r = await runTool(tools, c.name ?? "", c.input, viewer);
        return { type: "tool_result", tool_use_id: c.id, content: r.content, ...(r.ok ? {} : { is_error: true }) } as ApiBlock;
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return "این سؤال بیش از حد چندمرحله‌ای شد؛ لطفاً دقیق‌ترش کنید.";
}

function textOf(content: ApiBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

// Development stand-in: picks a tool from keywords, runs it for real, and
// shows its result, so the page and tools can be tried without an API key
async function mockAnswer(question: string, tools: Tool[], viewer: Viewer): Promise<string> {
  const routes: [RegExp, string, unknown][] = [
    [/فاکتور|بدهی|پرداخت نشده/, "unpaid_invoices", {}],
    [/سود|درآمد|هزینه|مالی/, "month_finance", {}],
    [/عقب|دیر|تاخیر|تأخیر/, "overdue_tasks", { scope: /من/.test(question) ? "mine" : "all" }],
    [/پیگیری|مشتری بالقوه|لید/, "lead_follow_ups", {}],
    [/سایت|دامنه|ssl/i, "site_status", {}],
    [/امروز|کی سر کار|مرخصی/, "team_today", {}],
    [/انتشار|برنامه|هفته/, "content_schedule", { days: 7 }],
  ];
  const hit = routes.find(([re, name]) => re.test(question) && tools.some((t) => t.name === name));
  if (!hit && routes.some(([re]) => re.test(question))) return "به این اطلاعات دسترسی ندارم.";
  const [, name, input] = hit ?? [null, "overview", {}];
  const r = await runTool(tools, name, input, viewer);
  return `(حالت آزمایشی) نتیجه ابزار ${name}:\n${r.content}`;
}

// Questions shown as one-tap suggestions on the empty chat
export function suggestionsFor(role: Role): string[] {
  const common = ["امروز چه خبره؟", "کدوم کارها عقب افتاده؟", "برنامه انتشار این هفته", "وضعیت سایت مشتری‌ها", "پیگیری‌های فروش امروز"];
  return role === "admin" ? [...common, "فاکتورهای پرداخت نشده", "سود این ماه چقدر بوده؟"] : common;
}
