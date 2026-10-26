import { desc, eq } from "drizzle-orm";
import { ArrowLeft, CalendarClock, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader, chipClass } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, OPEN_STAGES, followUpState, pipelineStats } from "@/lib/crm";
import { teamOptions } from "@/lib/data";
import { formatIsoDate, formatToman, toPersianDigits } from "@/lib/format";
import { tehranDay } from "@/lib/growth";
import { periodOf, periodRange } from "@/lib/payroll";
import { advanceLead, createLead } from "./actions";
import { LeadForm } from "./forms";

export const metadata: Metadata = { title: "مشتریان بالقوه" };

const FOLLOW_TONE = { overdue: "danger", today: "warning", soon: "info" } as const;
const FOLLOW_LABEL = { overdue: "پیگیری عقب افتاده", today: "پیگیری امروز", soon: "پیگیری نزدیک" } as const;

export default async function CrmPage(props: PageProps<"/crm">) {
  const user = await requireTeam();
  const mine = (await props.searchParams).owner === "me";
  const [rows, team] = await Promise.all([
    db
      .select({ lead: schema.leads, ownerName: schema.users.name })
      .from(schema.leads)
      .leftJoin(schema.users, eq(schema.users.id, schema.leads.ownerId))
      .orderBy(desc(schema.leads.updatedAt)),
    teamOptions(),
  ]);
  const leads = mine ? rows.filter((r) => r.lead.ownerId === user.id) : rows;
  const today = tehranDay();
  const stats = pipelineStats(leads.map((r) => r.lead), periodRange(periodOf()).start);
  const due = leads
    .filter((r) => {
      const f = followUpState(r.lead.nextFollowUp, today, r.lead.stage);
      return f === "overdue" || f === "today";
    })
    .sort((a, b) => (a.lead.nextFollowUp ?? "").localeCompare(b.lead.nextFollowUp ?? ""));
  const closed = leads.filter((r) => r.lead.stage === "won" || r.lead.stage === "lost").slice(0, 8);

  return (
    <>
      <PageHeader title="مشتریان بالقوه" description="سرنخ‌ها از اولین پیام تا بستن قرارداد" />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card><p className="text-xs text-muted-foreground">سرنخ باز</p><p className="mt-1 text-2xl font-bold">{toPersianDigits(stats.open)}</p></Card>
        <Card><p className="text-xs text-muted-foreground">ارزش ماهانه سرنخ‌های باز</p><p className="mt-1 text-2xl font-bold">{formatToman(stats.openValue)}</p></Card>
        <Card><p className="text-xs text-muted-foreground">بسته‌شده این ماه</p><p className="mt-1 text-2xl font-bold text-success">{toPersianDigits(stats.wonCount)}</p><p className="text-xs text-muted-foreground">{formatToman(stats.wonValue)} در ماه</p></Card>
        <Card><p className="text-xs text-muted-foreground">نرخ موفقیت این ماه</p><p className="mt-1 text-2xl font-bold">{stats.winRate == null ? "—" : `${toPersianDigits(Math.round(stats.winRate * 100))}٪`}</p></Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/crm" className={chipClass(!mine)}>همه</Link>
        <Link href="/crm?owner=me" className={chipClass(mine)}>سرنخ‌های من</Link>
      </div>

      {due.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarClock className="size-4" />پیگیری‌های امروز</h2>
          <ul className="divide-y divide-border text-sm">
            {due.map(({ lead: l }) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/crm/${l.id}`} className="font-medium hover:text-primary">{l.name}{l.business && <span className="text-muted-foreground"> · {l.business}</span>}</Link>
                <span className="flex items-center gap-2">
                  {l.phone && <a href={`tel:${l.phone}`} className="text-muted-foreground hover:text-primary" aria-label="تماس"><Phone className="size-4" /></a>}
                  <Badge tone={FOLLOW_TONE[followUpState(l.nextFollowUp, today, l.stage)!]}>{formatIsoDate(l.nextFollowUp)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="-mx-4 mb-8 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {OPEN_STAGES.map((stage, col) => {
          const cards = leads.filter((r) => r.lead.stage === stage);
          const next = OPEN_STAGES[col + 1] ?? "won";
          return (
            <section key={stage} data-stage={stage} className="glass flex w-72 shrink-0 snap-start flex-col rounded-[28px] p-2.5">
              <h2 className="flex items-center justify-between px-2 pt-1 pb-2.5 text-sm font-semibold">
                {LEAD_STAGE_LABELS[stage]}
                <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">{toPersianDigits(cards.length)}</span>
              </h2>
              <ul className="flex min-h-24 flex-col gap-2.5">
                {cards.map(({ lead: l, ownerName }) => {
                  const f = followUpState(l.nextFollowUp, today, l.stage);
                  return (
                    <li key={l.id} className="rounded-3xl bg-surface-raised p-3.5 shadow-card">
                      <Link href={`/crm/${l.id}`} className="block font-semibold hover:text-primary">{l.name}</Link>
                      {l.business && <p className="text-xs text-muted-foreground">{l.business}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge>{LEAD_SOURCE_LABELS[l.source]}</Badge>
                        {l.value ? <Badge tone="primary">{formatToman(l.value)}</Badge> : null}
                        {f && <Badge tone={FOLLOW_TONE[f]}>{FOLLOW_LABEL[f]}</Badge>}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{ownerName ?? "بدون مسئول"}</span>
                        <form action={advanceLead.bind(null, l.id, next)}>
                          <button type="submit" className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-muted hover:text-foreground" aria-label={`انتقال به ${LEAD_STAGE_LABELS[next]}`}>
                            {LEAD_STAGE_LABELS[next]}<ArrowLeft className="size-3.5" />
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] [&>*]:min-w-0">
        <Card>
          <h2 className="mb-4 font-semibold">سرنخ تازه</h2>
          <LeadForm action={createLead} team={team} submitLabel="ثبت سرنخ" compact />
        </Card>
        <Card className="h-fit">
          <h2 className="mb-3 font-semibold">آخرین نتیجه‌ها</h2>
          {closed.length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز سرنخی بسته یا از دست نرفته است.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {closed.map(({ lead: l }) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <Link href={`/crm/${l.id}`} className="hover:text-primary">{l.name}</Link>
                  <Badge tone={l.stage === "won" ? "success" : "danger"}>{LEAD_STAGE_LABELS[l.stage]}</Badge>
                </li>
              ))}
            </ul>
          )}
          {stats.bySource.size > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs text-muted-foreground">منبع سرنخ‌ها</p>
              <ul className="space-y-1 text-xs">
                {[...stats.bySource.entries()].sort((a, b) => b[1].total - a[1].total).map(([src, s]) => (
                  <li key={src} className="flex justify-between"><span>{LEAD_SOURCE_LABELS[src]}</span><span>{toPersianDigits(s.total)} سرنخ · {toPersianDigits(s.won)} قرارداد</span></li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
