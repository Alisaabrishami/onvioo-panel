import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplyForm } from "@/components/reply-form";
import { TicketThread } from "@/components/ticket-thread";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { toPersianDigits } from "@/lib/format";
import { TICKET_STATUS_LABELS, TICKET_STATUS_TONES } from "@/lib/services";
import { replyTicket, setTicketStatus } from "../actions";

export const metadata: Metadata = { title: "تیکت" };

export default async function TicketPage(props: PageProps<"/tickets/[id]">) {
  await requireTeam();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ ticket: schema.tickets, clientName: schema.clients.name, clientId: schema.clients.id, projectTitle: schema.projects.title })
    .from(schema.tickets)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.tickets.clientId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.tickets.projectId))
    .where(eq(schema.tickets.id, id));
  if (!row) notFound();
  const t = row.ticket;

  return (
    <>
      <PageHeader
        title={`#${toPersianDigits(t.number ?? 0)} ${t.title}`}
        description={[row.clientName, row.projectTitle].filter(Boolean).join(" · ")}
        actions={<Badge tone={TICKET_STATUS_TONES[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>}
      />
      <div className="max-w-3xl space-y-4">
        <TicketThread ticketId={t.id} viewer="team" />
        <Card>
          {t.status === "closed" ? (
            <form action={setTicketStatus.bind(null, t.id, "open")} className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">این تیکت بسته شده است.</p>
              <Button type="submit" variant="outline">باز کردن دوباره</Button>
            </form>
          ) : (
            <>
              <ReplyForm action={replyTicket.bind(null, t.id)} placeholder="پاسخ به مشتری…" />
              <form action={setTicketStatus.bind(null, t.id, "closed")} className="mt-3 border-t border-border pt-3">
                <button type="submit" className="text-sm text-muted-foreground hover:text-danger">بستن تیکت</button>
              </form>
            </>
          )}
        </Card>
        <Link href={`/clients/${row.clientId}`} className="text-sm text-primary hover:underline">صفحه مشتری</Link>
      </div>
    </>
  );
}
