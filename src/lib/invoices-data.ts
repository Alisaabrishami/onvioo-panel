import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { toPersianDigits, formatToman } from "./format";
import { tehranDay } from "./growth";
import { notifyClient, notifyTeam } from "./notify";
import { getSetting } from "./settings";

export const newPayToken = () => randomBytes(18).toString("base64url");

export function invoiceLabel(number: number | null) {
  return `فاکتور شماره ${toPersianDigits(number ?? 0)}`;
}

// Where online payments land: the account chosen in settings, else the first bank account
export async function paymentAccountId(): Promise<string | null> {
  const s = await getSetting("payment");
  if (s.accountId) return s.accountId;
  const [a] = await db
    .select({ id: schema.financeAccounts.id })
    .from(schema.financeAccounts)
    .where(and(eq(schema.financeAccounts.kind, "bank"), eq(schema.financeAccounts.active, true)))
    .orderBy(asc(schema.financeAccounts.createdAt))
    .limit(1);
  return a?.id ?? null;
}

// Marks an invoice paid and records the money in finance; safe to call twice
export async function settleInvoice(
  invoiceId: string,
  opts: { accountId: string | null; day?: string; reference?: string | null; byUserId?: string | null; online?: boolean },
): Promise<boolean> {
  const settled = await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).for("update");
    if (!inv || inv.status === "paid" || inv.status === "cancelled") return null;
    let transactionId: string | null = null;
    if (opts.accountId) {
      const [t] = await tx
        .insert(schema.transactions)
        .values({
          accountId: opts.accountId,
          day: opts.day ?? tehranDay(),
          direction: "in",
          amount: inv.total,
          category: "client_payment",
          description: `${invoiceLabel(inv.number)} · ${inv.title}`,
          reference: opts.reference ?? null,
          clientId: inv.clientId,
          createdBy: opts.byUserId ?? null,
        })
        .returning({ id: schema.transactions.id });
      transactionId = t.id;
    }
    await tx.update(schema.invoices).set({ status: "paid", paidAt: new Date(), transactionId }).where(eq(schema.invoices.id, inv.id));
    return inv;
  });
  if (!settled) return false;
  await audit(opts.byUserId ?? null, "pay", "invoice", invoiceId, { online: !!opts.online, reference: opts.reference });
  const [client] = await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, settled.clientId));
  await notifyTeam({
    title: `${invoiceLabel(settled.number)} پرداخت شد`,
    body: `${client?.name ?? ""} · ${formatToman(settled.total)}${opts.online ? " · آنلاین" : ""}${opts.accountId ? "" : " · حساب دریافت تعیین نشده؛ در مالی ثبت نشد"}`,
    href: `/invoices/${invoiceId}`,
  });
  await notifyClient(settled.clientId, { title: `پرداخت ${invoiceLabel(settled.number)} ثبت شد`, href: `/portal/invoices/${invoiceId}` });
  return true;
}
