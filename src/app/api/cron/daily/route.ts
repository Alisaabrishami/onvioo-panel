import { and, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { cronAuthorized } from "@/lib/cron";
import { OPEN_STAGES } from "@/lib/crm";
import { formatIsoDate, formatToman, toPersianDigits } from "@/lib/format";
import { addDays, tehranDay } from "@/lib/growth";
import { invoiceLabel } from "@/lib/invoices-data";
import { pruneChecks } from "@/lib/monitor-check";
import { notifyClient, notifyTeam, notifyUsers } from "@/lib/notify";
import { appUrl } from "@/lib/payment";
import { sendToUsers } from "@/lib/bot";
import { todayDigest } from "@/lib/bot-handler";
import { onLeaveToday } from "@/lib/team-data";

// Every morning: payment reminders, follow-ups due today, domains about to expire,
// and each team member's plan for the day in their Bale/Telegram chat
export async function POST(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const today = tehranDay();
  const now = new Date();

  // Invoices due tomorrow or overdue get an SMS at most every 3 days
  const due = await db
    .select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.status, "sent"),
        isNotNull(schema.invoices.dueOn),
        lte(schema.invoices.dueOn, addDays(today, 1)),
        or(isNull(schema.invoices.remindedAt), lt(schema.invoices.remindedAt, new Date(now.getTime() - 3 * 86400_000))),
      ),
    );
  for (const inv of due) {
    const overdue = inv.dueOn! < today;
    await notifyClient(
      inv.clientId,
      { title: `${overdue ? "سررسید گذشته" : "یادآوری"}: ${invoiceLabel(inv.number)} · ${formatToman(inv.total)}`, body: `${appUrl()}/pay/${inv.payToken}`, href: `/portal/invoices/${inv.id}` },
      { sms: true },
    );
    await db.update(schema.invoices).set({ remindedAt: now }).where(eq(schema.invoices.id, inv.id));
  }
  const overdueCount = due.filter((i) => i.dueOn! < today).length;
  if (overdueCount) await notifyTeam({ title: `${toPersianDigits(overdueCount)} فاکتور سررسید گذشته؛ یادآوری برای مشتری فرستاده شد`, href: "/invoices?status=overdue" });

  // Each owner gets one note listing the leads to call today
  const leads = await db
    .select({ id: schema.leads.id, name: schema.leads.name, ownerId: schema.leads.ownerId })
    .from(schema.leads)
    .where(and(inArray(schema.leads.stage, OPEN_STAGES), isNotNull(schema.leads.nextFollowUp), lte(schema.leads.nextFollowUp, today)));
  const byOwner = new Map<string, string[]>();
  for (const l of leads) if (l.ownerId) byOwner.set(l.ownerId, [...(byOwner.get(l.ownerId) ?? []), l.name]);
  for (const [ownerId, names] of byOwner) {
    await notifyUsers([ownerId], { title: `${toPersianDigits(names.length)} پیگیری برای امروز`, body: names.slice(0, 6).join("، "), href: "/crm?owner=me" });
  }

  // Domains expiring in exactly 30 or 7 days, or tomorrow
  const domains = await db
    .select({ url: schema.monitors.url, expires: schema.monitors.domainExpiresOn, clientName: schema.clients.name })
    .from(schema.monitors)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.monitors.clientId))
    .where(and(eq(schema.monitors.active, true), inArray(schema.monitors.domainExpiresOn, [addDays(today, 30), addDays(today, 7), addDays(today, 1)])));
  for (const d of domains) {
    await notifyTeam({ title: `دامنه ${new URL(d.url).hostname} در ${formatIsoDate(d.expires)} منقضی می‌شود`, body: d.clientName, href: "/monitoring" });
  }

  const onLeave = new Set(await onLeaveToday());
  const linked = await db
    .selectDistinct({ id: schema.users.id })
    .from(schema.chatLinks)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatLinks.userId))
    .where(and(inArray(schema.users.role, ["admin", "staff"]), eq(schema.users.active, true)));
  const planned = linked.filter((u) => !onLeave.has(u.id));
  for (const u of planned) await sendToUsers([u.id], { text: await todayDigest(u.id, now) });

  await pruneChecks();
  return Response.json({ reminders: due.length, followUps: leads.length, domains: domains.length, digests: planned.length });
}
