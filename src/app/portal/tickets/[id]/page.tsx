import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReplyForm } from "@/components/reply-form";
import { TicketThread } from "@/components/ticket-thread";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { toPersianDigits } from "@/lib/format";
import { TICKET_STATUS_LABELS, TICKET_STATUS_TONES } from "@/lib/services";
import { closeOwnTicket, replyAsClient } from "../actions";

export const metadata: Metadata = { title: "تیکت" };

export default async function PortalTicketPage(props: PageProps<"/portal/tickets/[id]">) {
  const user = await requireClient();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [t] = await db
    .select()
    .from(schema.tickets)
    .where(and(eq(schema.tickets.id, id), eq(schema.tickets.clientId, user.clientId)));
  if (!t) notFound();
  return (
    <>
      <PageHeader
        title={`#${toPersianDigits(t.number ?? 0)} ${t.title}`}
        actions={<Badge tone={TICKET_STATUS_TONES[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>}
      />
      <div className="space-y-4">
        <TicketThread ticketId={t.id} viewer="client" />
        <Card>
          <ReplyForm
            action={replyAsClient.bind(null, t.id)}
            placeholder={t.status === "closed" ? "پیام جدید، تیکت را دوباره باز می‌کند…" : "پیام شما…"}
            submitLabel="ارسال"
            attachments={{ clientId: user.clientId }}
          />
          {t.status !== "closed" && (
            <form action={closeOwnTicket.bind(null, t.id)} className="mt-3 border-t border-border pt-3">
              <button type="submit" className="text-sm text-muted-foreground hover:text-primary">مشکل حل شد، تیکت را ببند</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
