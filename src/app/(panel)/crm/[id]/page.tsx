import { desc, eq } from "drizzle-orm";
import { AtSign, Phone, Trash2, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { ACTIVITY_LABELS, LEAD_STAGES, LEAD_STAGE_LABELS, OPEN_STAGES } from "@/lib/crm";
import { isUuid, teamOptions } from "@/lib/data";
import { formatJalaliDateTime, isoDateToJalali } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addActivity, advanceLead, convertLead, deleteLead, draftFollowUp, moveLead, updateLead } from "../actions";
import { ActivityForm, DraftMessage, LeadForm, LostForm } from "../forms";

export const metadata: Metadata = { title: "سرنخ" };

export default async function LeadPage(props: PageProps<"/crm/[id]">) {
  const user = await requireTeam();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) notFound();
  const [activities, team] = await Promise.all([
    db
      .select({ activity: schema.leadActivities, name: schema.users.name })
      .from(schema.leadActivities)
      .leftJoin(schema.users, eq(schema.users.id, schema.leadActivities.userId))
      .where(eq(schema.leadActivities.leadId, id))
      .orderBy(desc(schema.leadActivities.createdAt)),
    teamOptions(),
  ]);
  const open = OPEN_STAGES.includes(lead.stage);

  return (
    <>
      <PageHeader
        title={lead.name}
        description={lead.business ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {lead.phone && <a href={`tel:${lead.phone}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-3.5 text-sm hover:bg-muted"><Phone className="size-4" /><span dir="ltr">{lead.phone}</span></a>}
            {lead.instagram && <a href={`https://instagram.com/${lead.instagram}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-3.5 text-sm hover:bg-muted"><AtSign className="size-4" />@{lead.instagram}</a>}
          </div>
        }
      />

      <Card className="mb-6 space-y-4">
        <ol className="flex flex-wrap gap-2" aria-label="مرحله">
          {LEAD_STAGES.filter((s) => s !== "lost").map((s) => (
            <li key={s}>
              <form action={advanceLead.bind(null, lead.id, s)}>
                <button
                  type="submit"
                  disabled={s === lead.stage}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    s === lead.stage ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {LEAD_STAGE_LABELS[s]}
                </button>
              </form>
            </li>
          ))}
          {lead.stage === "lost" && <li><Badge tone="danger" className="h-8 px-3.5 text-sm">از دست رفت{lead.lostReason && `: ${lead.lostReason}`}</Badge></li>}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {lead.clientId ? (
            <Link href={`/clients/${lead.clientId}`} className="inline-flex items-center gap-2 text-sm text-primary"><UserCheck className="size-4" />به مشتری تبدیل شده؛ صفحه مشتری</Link>
          ) : (
            <form action={convertLead.bind(null, lead.id)}>
              <Button type="submit"><UserCheck className="size-4" />قرارداد بسته شد؛ ساخت مشتری</Button>
            </form>
          )}
          {open && <LostForm action={moveLead.bind(null, lead.id, "lost")} />}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] [&>*]:min-w-0">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">ثبت تماس یا پیگیری</h2>
            <ActivityForm action={addActivity.bind(null, lead.id)} />
          </Card>
          <Card>
            <h2 className="mb-4 font-semibold">تاریخچه</h2>
            <ol className="space-y-3">
              {activities.map(({ activity: a, name }) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <Badge tone={a.kind === "stage" ? "primary" : "neutral"} className="h-6 shrink-0">{ACTIVITY_LABELS[a.kind]}</Badge>
                  <div>
                    <p>{a.body}</p>
                    <p className="text-xs text-muted-foreground">{name ?? "—"} · {formatJalaliDateTime(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-6">
          {open && (
            <Card>
              <DraftMessage action={draftFollowUp.bind(null, lead.id)} />
            </Card>
          )}
          <Card>
            <h2 className="mb-4 font-semibold">مشخصات</h2>
            <LeadForm
              action={updateLead.bind(null, lead.id)}
              team={team}
              submitLabel="ذخیره"
              initial={{
                name: lead.name,
                business: lead.business ?? "",
                phone: lead.phone ?? "",
                instagram: lead.instagram ?? "",
                source: lead.source,
                value: lead.value == null ? "" : String(lead.value),
                services: lead.services ?? "",
                ownerId: lead.ownerId ?? "",
                nextFollowUp: isoDateToJalali(lead.nextFollowUp),
                notes: lead.notes ?? "",
              }}
            />
          </Card>
          {user.role === "admin" && (
            <form action={deleteLead.bind(null, lead.id)}>
              <Button type="submit" variant="ghost" className="text-muted-foreground hover:text-danger"><Trash2 className="size-4" />حذف سرنخ</Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
