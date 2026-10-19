import { and, desc, eq, type SQL } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import type { TicketStatus } from "@/db/schema";
import { requireTeam } from "@/lib/auth/dal";
import { PRIORITY_LABELS, PRIORITY_TONES } from "@/lib/content";
import { formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import { TICKET_STATUS_LABELS, TICKET_STATUS_TONES } from "@/lib/services";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "تیکت‌ها" };

const VIEWS: { key: TicketStatus | "all"; label: string }[] = [
  { key: "open", label: "منتظر پاسخ" },
  { key: "answered", label: "پاسخ داده شده" },
  { key: "closed", label: "بسته" },
  { key: "all", label: "همه" },
];

export default async function TicketsPage(props: PageProps<"/tickets">) {
  await requireTeam();
  const sp = await props.searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "open";
  const filters: SQL[] = [];
  if (view !== "all") filters.push(eq(schema.tickets.status, view));

  const rows = await db
    .select({ ticket: schema.tickets, clientName: schema.clients.name, projectTitle: schema.projects.title })
    .from(schema.tickets)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.tickets.clientId))
    .leftJoin(schema.projects, eq(schema.projects.id, schema.tickets.projectId))
    .where(and(...filters))
    .orderBy(desc(schema.tickets.updatedAt))
    .limit(200);

  return (
    <>
      <PageHeader title="تیکت‌های پشتیبانی" description="درخواست‌های مشتری‌ها از پرتال" />
      <div className="mb-3 flex flex-wrap gap-1 text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.key === "open" ? "/tickets" : `/tickets?view=${v.key}`}
            className={cn("rounded-full px-3.5 py-1.5", v.key === view ? "bg-primary font-medium text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-muted")}
          >
            {v.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState>{view === "open" ? "تیکتی منتظر پاسخ نیست." : "تیکتی پیدا نشد."}</EmptyState>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {rows.map(({ ticket: t, clientName, projectTitle }) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      <span className="text-muted-foreground">#{toPersianDigits(t.number ?? 0)}</span> {t.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {clientName}
                      {projectTitle && ` · ${projectTitle}`} · {formatJalaliDateTime(t.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {t.priority !== "normal" && <Badge tone={PRIORITY_TONES[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>}
                    <Badge tone={TICKET_STATUS_TONES[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
