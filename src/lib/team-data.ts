import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { hourlyCost, leaveDaysWithin, minutesWithin, periodRange, type MemberStats } from "./payroll";
import { tehranDay } from "./growth";

export async function openStretch(userId: string) {
  const [row] = await db
    .select({ stretch: schema.attendance, clientName: schema.clients.name })
    .from(schema.attendance)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.attendance.clientId))
    .where(and(eq(schema.attendance.userId, userId), isNull(schema.attendance.clockOut)))
    .limit(1);
  return row ?? null;
}

// Stretches that overlap [start, end), for some or all people
export function stretchesBetween(start: Date, end: Date, userIds?: string[]) {
  return db
    .select()
    .from(schema.attendance)
    .where(
      and(
        lt(schema.attendance.clockIn, end),
        or(isNull(schema.attendance.clockOut), gte(schema.attendance.clockOut, start)),
        userIds ? inArray(schema.attendance.userId, userIds) : undefined,
      ),
    )
    .orderBy(asc(schema.attendance.clockIn));
}

export function activeTeam() {
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      title: schema.staffProfiles.title,
      payType: schema.staffProfiles.payType,
      rate: schema.staffProfiles.rate,
    })
    .from(schema.users)
    .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.userId, schema.users.id))
    .where(and(ne(schema.users.role, "client"), eq(schema.users.active, true)))
    .orderBy(asc(schema.users.name));
}

// Pieces of content each person delivered in the month: moved to published while they were the assignee
export async function deliveredItems(start: Date, end: Date): Promise<{ userId: string; clientId: string; contentId: string }[]> {
  const rows = await db
    .selectDistinct({ userId: schema.contents.assigneeId, clientId: schema.contents.clientId, contentId: schema.contents.id })
    .from(schema.contentEvents)
    .innerJoin(schema.contents, eq(schema.contents.id, schema.contentEvents.contentId))
    .where(
      and(
        eq(schema.contentEvents.toStage, "published"),
        gte(schema.contentEvents.createdAt, start),
        lt(schema.contentEvents.createdAt, end),
        isNotNull(schema.contents.assigneeId),
      ),
    );
  return rows.filter((r): r is { userId: string; clientId: string; contentId: string } => !!r.userId);
}

export async function unpaidLeaveDays(period: string): Promise<Map<string, number>> {
  const { start, end } = periodRange(period);
  const from = tehranDay(start);
  const to = tehranDay(end);
  const rows = await db
    .select()
    .from(schema.leaveRequests)
    .where(
      and(
        eq(schema.leaveRequests.status, "approved"),
        eq(schema.leaveRequests.kind, "unpaid"),
        lt(schema.leaveRequests.startsOn, to),
        gte(schema.leaveRequests.endsOn, from),
      ),
    );
  const days = new Map<string, number>();
  for (const r of rows) days.set(r.userId, (days.get(r.userId) ?? 0) + leaveDaysWithin(r.startsOn, r.endsOn, from, to));
  return days;
}

export async function memberStats(period: string, now: Date = new Date()): Promise<MemberStats[]> {
  const { start, end } = periodRange(period);
  const [team, stretches, delivered, tasks] = await Promise.all([
    activeTeam(),
    stretchesBetween(start, end),
    deliveredItems(start, end),
    db
      .select({ assigneeId: schema.tasks.assigneeId, dueAt: schema.tasks.dueAt, completedAt: schema.tasks.completedAt, status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(isNotNull(schema.tasks.dueAt), gte(schema.tasks.dueAt, start), lt(schema.tasks.dueAt, end))),
  ]);
  return team.map((m) => {
    const mine = tasks.filter((t) => t.assigneeId === m.id && (t.status === "done" || t.dueAt! < now));
    return {
      userId: m.id,
      delivered: delivered.filter((d) => d.userId === m.id).length,
      dueTasks: mine.length,
      onTime: mine.filter((t) => t.completedAt && t.completedAt <= t.dueAt!).length,
      minutes: minutesWithin(stretches.filter((s) => s.userId === m.id), start, end, now),
    };
  });
}

// Labour cost per client for the month: hours on that client at each
// person's hourly cost, plus per-item pay for pieces delivered for it
export async function laborCostByClient(period: string, now: Date = new Date()) {
  const { start, end } = periodRange(period);
  const [team, stretches, delivered] = await Promise.all([activeTeam(), stretchesBetween(start, end), deliveredItems(start, end)]);
  const byId = new Map(team.map((m) => [m.id, m]));
  const cost = new Map<string, { minutes: number; cost: number }>();
  const add = (clientId: string, minutes: number, amount: number) => {
    const c = cost.get(clientId) ?? { minutes: 0, cost: 0 };
    cost.set(clientId, { minutes: c.minutes + minutes, cost: c.cost + amount });
  };
  for (const s of stretches) {
    if (!s.clientId) continue;
    const m = byId.get(s.userId);
    const minutes = minutesWithin([s], start, end, now);
    add(s.clientId, minutes, m?.payType ? (minutes / 60) * hourlyCost(m.payType, m.rate ?? 0) : 0);
  }
  for (const d of delivered) {
    const m = byId.get(d.userId);
    if (m?.payType === "per_item") add(d.clientId, 0, m.rate ?? 0);
  }
  return cost;
}

export async function pendingLeaves() {
  return db
    .select({ leave: schema.leaveRequests, name: schema.users.name })
    .from(schema.leaveRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.leaveRequests.userId))
    .where(eq(schema.leaveRequests.status, "pending"))
    .orderBy(asc(schema.leaveRequests.startsOn));
}

export async function onLeaveToday(): Promise<string[]> {
  const today = tehranDay();
  const rows = await db
    .select({ userId: schema.leaveRequests.userId })
    .from(schema.leaveRequests)
    .where(and(eq(schema.leaveRequests.status, "approved"), lte(schema.leaveRequests.startsOn, today), gte(schema.leaveRequests.endsOn, today)));
  return rows.map((r) => r.userId);
}
