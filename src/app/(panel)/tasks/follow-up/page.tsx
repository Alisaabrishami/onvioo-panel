import { Bot } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import type { TaskUpdateKind } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/dal";
import { CHECKIN_LABELS, ESCALATE_AFTER, groupForDigest } from "@/lib/follow-up";
import { followedTasks, taskHistory } from "@/lib/follow-up-run";
import { formatJalaliDate, formatJalaliDateTime, toPersianDigits } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "پیگیری‌های دستیار" };

const UPDATE_LABELS: Record<TaskUpdateKind, string> = {
  asked: "دستیار پرسید",
  on_track: "گفت در حال انجام است",
  blocked: "گفت گیر کرده",
  done: "تمامش کرد",
  escalated: "جواب نداد؛ به مدیر خبر داده شد",
};

const SECTIONS = [
  { key: "blocked", title: "گیر کرده", tone: "danger" },
  { key: "silent", title: "جواب نداده", tone: "warning" },
  { key: "late", title: "عقب افتاده", tone: "warning" },
  { key: "onTrack", title: "در جریان", tone: "primary" },
  { key: "done", title: "در ۲۴ ساعت گذشته تمام شد", tone: "success" },
] as const;

export default async function FollowUpPage(props: PageProps<"/tasks/follow-up">) {
  const user = await requireAdmin();
  const sp = await props.searchParams;
  const all = sp.who === "all";
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 3600_000);
  const tasks = await followedTasks(all ? null : user.id, since);
  const groups = groupForDigest(tasks, now, since);
  const history = await taskHistory(tasks.map((t) => t.id));
  const historyOf = (id: string) => history.filter((h) => h.taskId === id).slice(-4).reverse();

  return (
    <>
      <PageHeader
        title="پیگیری‌های دستیار"
        description="کارهایی که دستیار از طرف مدیر از کارکنان پیگیری می‌کند؛ هر صبح خلاصه همین صفحه برایتان فرستاده می‌شود"
        actions={
          <div className="flex gap-1 text-sm">
            <Link href="/tasks/follow-up" className={cn("rounded-full px-3.5 py-1.5", !all ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              پیگیری‌های من
            </Link>
            <Link href="/tasks/follow-up?who=all" className={cn("rounded-full px-3.5 py-1.5", all ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              همه مدیران
            </Link>
          </div>
        }
      />
      {tasks.length === 0 ? (
        <EmptyState>
          هنوز کاری به دستیار سپرده نشده است. در صفحه <Link href="/tasks" className="text-primary">کارها</Link> موقع ساخت کار تیک «دستیار از طرف من پیگیر این کار باشد» را بزنید، یا روی آیکن <Bot className="inline size-4" /> کنار هر کار بزنید.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(({ key, title, tone }) => {
            const list = groups[key];
            if (list.length === 0) return null;
            return (
              <section key={key}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {title}
                  <Badge tone={tone}>{toPersianDigits(list.length)}</Badge>
                </h2>
                <Card className="py-1">
                  <ul className="divide-y divide-border">
                    {list.map((t) => (
                      <li key={t.id} className="py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium">{t.title}</p>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {t.assignee && <span>مسئول: {t.assignee}</span>}
                            {all && t.manager && <span>پیگیری برای: {t.manager}</span>}
                            {t.clientName && <span>{t.clientName}</span>}
                            {t.dueAt && <span className={cn(t.status !== "done" && t.dueAt < now && "font-medium text-danger")}>مهلت {formatJalaliDate(t.dueAt)}</span>}
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                          {t.status !== "done" && t.checkin && <Badge tone={t.checkin === "blocked" ? "danger" : t.checkin === "asked" ? "warning" : "primary"}>{CHECKIN_LABELS[t.checkin]}</Badge>}
                          {t.unanswered >= ESCALATE_AFTER && t.status !== "done" && <span className="text-danger">{toPersianDigits(t.unanswered)} بار پرسیده شد و جوابی نیامد</span>}
                          {t.checkinNote && t.status !== "done" && <span>«{t.checkinNote}»</span>}
                          {t.answeredAt && <span className="text-muted-foreground">آخرین جواب: {formatJalaliDateTime(t.answeredAt)}</span>}
                        </div>
                        {historyOf(t.id).length > 0 && (
                          <ol className="mt-2 space-y-0.5 border-s border-border ps-3 text-xs text-muted-foreground">
                            {historyOf(t.id).map((h, i) => (
                              <li key={i}>
                                {formatJalaliDateTime(h.createdAt)} · {UPDATE_LABELS[h.kind]}
                                {h.note ? `: «${h.note}»` : ""}
                              </li>
                            ))}
                          </ol>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
