import "server-only";
import { and, asc, eq, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { profitAndLoss } from "./finance";
import { tehranDay } from "./growth";
import { periodRange } from "./payroll";

export function financeAccounts() {
  return db.select().from(schema.financeAccounts).orderBy(asc(schema.financeAccounts.createdAt));
}

export async function accountLocked(accountId: string, day: string): Promise<boolean> {
  const [a] = await db.select({ lockedThrough: schema.financeAccounts.lockedThrough }).from(schema.financeAccounts).where(eq(schema.financeAccounts.id, accountId));
  return !!a?.lockedThrough && day <= a.lockedThrough;
}

// Each account's balance on (and including) a day; the opening balance is the start
export async function balances(throughDay?: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      accountId: schema.transactions.accountId,
      total: sql<string>`coalesce(sum(case when ${schema.transactions.direction} = 'in' then ${schema.transactions.amount} else -${schema.transactions.amount} end), 0)`,
    })
    .from(schema.transactions)
    .where(throughDay ? lte(schema.transactions.day, throughDay) : undefined)
    .groupBy(schema.transactions.accountId);
  const accounts = await financeAccounts();
  return new Map(accounts.map((a) => [a.id, a.openingBalance + Number(rows.find((r) => r.accountId === a.id)?.total ?? 0)]));
}

export function transactionsBetween(fromDay: string, toDayExclusive: string, accountId?: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.day, fromDay),
        lt(schema.transactions.day, toDayExclusive),
        accountId ? eq(schema.transactions.accountId, accountId) : undefined,
      ),
    )
    .orderBy(asc(schema.transactions.day), asc(schema.transactions.createdAt));
}

// A Jalali month as ISO days [from, to)
export function periodDayRange(period: string): { from: string; to: string } {
  const { start, end } = periodRange(period);
  return { from: tehranDay(start), to: tehranDay(end) };
}

export function partnersList() {
  return db.select().from(schema.partners).orderBy(asc(schema.partners.createdAt));
}

// All partner money ever moved, for running partner balances
export function partnerTransactions() {
  return db.select().from(schema.transactions).where(isNotNull(schema.transactions.partnerId));
}

// Profit from the first transaction up to (not including) a day, for partner shares
export async function profitBefore(day: string): Promise<number> {
  const rows = await db
    .select({ category: schema.transactions.category, total: sql<string>`sum(${schema.transactions.amount})` })
    .from(schema.transactions)
    .where(lt(schema.transactions.day, day))
    .groupBy(schema.transactions.category);
  return profitAndLoss(rows.map((r) => ({ day, direction: "in", amount: Number(r.total), category: r.category }))).profit;
}
