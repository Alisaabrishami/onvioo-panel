import { Paperclip } from "lucide-react";
import { formatBytes, formatJalaliDateTime } from "@/lib/format";
import { ticketMessages } from "@/lib/ops/tickets";
import { cn } from "@/lib/utils";

// Messages of a ticket; `viewer` decides which side is drawn as "mine"
export async function TicketThread({ ticketId, viewer }: { ticketId: string; viewer: "team" | "client" }) {
  const messages = await ticketMessages(ticketId);

  return (
    <ul className="space-y-3">
      {messages.map((m) => {
        const fromClient = m.authorRole === "client";
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
              {m.body && <p className="whitespace-pre-line leading-6">{m.body}</p>}
              {m.attachments.length > 0 && (
                <ul className={cn("flex flex-wrap gap-2", m.body && "mt-2")}>
                  {m.attachments.map((f) => (
                    <li key={f.id}>
                      <a
                        href={`/files/${f.id}/download`}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs hover:border-primary hover:text-primary"
                      >
                        <Paperclip className="size-3.5 shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
