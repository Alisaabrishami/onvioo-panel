import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatJalaliDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// Messages of a ticket; `viewer` decides which side is drawn as "mine"
export async function TicketThread({ ticketId, viewer }: { ticketId: string; viewer: "team" | "client" }) {
  const messages = await db
    .select({
      id: schema.ticketMessages.id,
      body: schema.ticketMessages.body,
      createdAt: schema.ticketMessages.createdAt,
      author: schema.users.name,
      role: schema.users.role,
    })
    .from(schema.ticketMessages)
    .leftJoin(schema.users, eq(schema.users.id, schema.ticketMessages.userId))
    .where(eq(schema.ticketMessages.ticketId, ticketId))
    .orderBy(asc(schema.ticketMessages.createdAt));

  return (
    <ul className="space-y-3">
      {messages.map((m) => {
        const fromClient = m.role === "client";
        const mine = viewer === "client" ? fromClient : !fromClient;
        return (
          <li key={m.id} className={cn("flex", mine ? "justify-start" : "justify-end")}>
            <div className={cn("max-w-[85%] rounded-2xl p-3 text-sm", mine ? "bg-primary/10" : "border border-border bg-surface")}>
              <div className="mb-1 flex justify-between gap-4 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {fromClient ? m.author : viewer === "client" ? "پشتیبانی Onvioo" : m.author}
                </span>
                <span>{formatJalaliDateTime(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-line leading-6">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
