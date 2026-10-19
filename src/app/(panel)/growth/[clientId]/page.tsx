import { eq } from "drizzle-orm";
import { Clock, ExternalLink, FileText, Lightbulb, RefreshCw, Share2, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { BarChart, compact } from "@/components/charts";
import { Delta } from "@/components/delta";
import { ForecastCard } from "@/components/forecast-card";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { aiConfigured } from "@/lib/ai";
import { requireTeam } from "@/lib/auth/dal";
import { TYPE_LABELS } from "@/lib/content";
import { isUuid } from "@/lib/data";
import { formatJalaliDate, formatJalaliDateTime, isoDateToJalali, toPersianDigits } from "@/lib/format";
import { engagementRate, performance, tehranDay } from "@/lib/growth";
import type { TrendIdeas, WeeklyReport } from "@/lib/growth-ai";
import { loadGrowth } from "@/lib/growth-view";
import {
  addAccount,
  addDailyEntry,
  connectAccount,
  explainSpikeAction,
  generateIdeas,
  generateWeekly,
  ideaToContent,
  importCsv,
  removeAccount,
  shareReport,
  syncNow,
} from "../actions";
import { AddAccountForm, ConnectForm, CsvImportForm, DailyEntryForm, IdeaList } from "./forms";

export const metadata: Metadata = { title: "رشد پیج" };

type Spike = { username: string; ratio: number; why?: string; takeaways?: string[] };

export default async function ClientGrowthPage(props: PageProps<"/growth/[clientId]">) {
  const user = await requireTeam();
  const { clientId } = await props.params;
  if (!isUuid(clientId)) notFound();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) notFound();

  const g = await loadGrowth(clientId);
  const ai = aiConfigured();
  const ideas = g.ideas?.data as TrendIdeas | undefined;
  const main = g.own[0];

  return (
    <>
      <PageHeader
        title={`رشد ${client.name}`}
        description={main ? `@${main.username}${main.lastSyncAt ? ` · به‌روزرسانی ${formatJalaliDateTime(main.lastSyncAt)}` : ""}` : "هنوز پیجی اضافه نشده است"}
        actions={
          <Link href={`/clients/${clientId}`} className="text-sm text-primary hover:underline">
            پرونده مشتری
          </Link>
        }
      />

      {g.own.length === 0 ? (
        <Card className="mb-6">
          <h2 className="mb-1 font-semibold">شروع: پیج اینستاگرام مشتری را اضافه کنید</h2>
          <p className="mb-4 text-sm text-muted-foreground">بعد از افزودن، آمار را با اتصال API، فایل CSV یا ثبت دستی وارد کنید.</p>
          <AddAccountForm action={addAccount.bind(null, clientId)} hasOwn={false} />
        </Card>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="فالوور" value={g.followers != null ? compact(g.followers) : "—"} extra={<Delta value={g.change1} />} extraLabel="دیروز" />
            <StatCard label="تغییر ۷ روز" value={<Delta value={g.change7} />} />
            <StatCard label="تغییر ۳۰ روز" value={<Delta value={g.change30} />} />
            <StatCard label="بازدید ۳۰ روز" value={g.viewsSeries.length ? compact(g.views30) : "—"} />
          </dl>

          <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <Card>
              <h2 className="mb-3 font-semibold">فالوور و پیش‌بینی رشد</h2>
              {g.forecast ? (
                <ForecastCard forecast={g.forecast} series={g.series} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">برای پیش‌بینی، آمار فالوور حداقل دو هفته لازم است.</p>
              )}
            </Card>
            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <Clock className="size-4 text-primary" />
                بهترین زمان انتشار
              </h2>
              {g.slots.hours.length === 0 ? (
                <p className="text-sm text-muted-foreground">با ثبت آمار پست‌ها مشخص می‌شود.</p>
              ) : (
                <>
                  <SlotList slots={g.slots.hours.slice(0, 3)} />
                  <h3 className="mb-2 mt-4 text-xs font-medium text-muted-foreground">بهترین روزها</h3>
                  <SlotList slots={g.slots.days.slice(0, 3)} />
                  <p className="mt-3 text-xs text-muted-foreground">میانگین بازدید پست‌های ۹۰ روز گذشته، به وقت تهران</p>
                </>
              )}
            </Card>
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">بازدید روزانه پیج</h2>
              <BarChart points={g.viewsSeries} label="بازدید روزانه" />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">بهترین و ضعیف‌ترین محتوا</h2>
              {g.top.length === 0 ? (
                <p className="text-sm text-muted-foreground">آمار پستی ثبت نشده است.</p>
              ) : (
                <>
                  <PostList posts={g.top} />
                  {g.bottom.length > 0 && (
                    <>
                      <h3 className="mb-2 mt-4 text-xs font-medium text-muted-foreground">کمتر دیده شده</h3>
                      <PostList posts={g.bottom} />
                    </>
                  )}
                </>
              )}
            </Card>
          </div>
        </>
      )}

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><FileText className="size-4 text-primary" />گزارش هفتگی</h2>
            <p className="text-xs text-muted-foreground">هر شنبه خودکار ساخته می‌شود؛ بعد از بازبینی برای مشتری بفرستید.</p>
          </div>
          {ai && g.own.length > 0 && (
            <ActionButton action={generateWeekly.bind(null, clientId)} pendingLabel="در حال نوشتن گزارش…">
              ساخت گزارش همین حالا
            </ActionButton>
          )}
        </div>
        {g.reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز گزارشی ساخته نشده است.</p>
        ) : (
          <ul className="divide-y divide-border">
            {g.reports.slice(0, 6).map((r) => {
              const report = r.data as WeeklyReport;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/growth/${clientId}/reports/${r.id}`} className="font-medium hover:text-primary">{report.headline}</Link>
                    <p className="text-xs text-muted-foreground">{formatJalaliDate(r.createdAt)}</p>
                  </div>
                  {r.sharedAt ? (
                    <Badge tone="success">برای مشتری ارسال شد</Badge>
                  ) : (
                    <form action={shareReport.bind(null, clientId, r.id)}>
                      <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
                        <Share2 className="size-3.5" />
                        ارسال برای مشتری
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-4 text-primary" />رادار ترند و ایده‌ها</h2>
            <p className="text-xs text-muted-foreground">
              از محتوای موفق این پیج و رقبا{g.ideas ? ` · آخرین بار ${formatJalaliDateTime(g.ideas.createdAt)}` : ""}
            </p>
          </div>
          {ai && (
            <ActionButton action={generateIdeas.bind(null, clientId)} pendingLabel="در حال پیدا کردن ایده…">
              ایده‌های تازه
            </ActionButton>
          )}
        </div>
        {ideas ? (
          <IdeaList ideas={ideas.ideas} toContent={ideaToContent.bind(null, clientId, g.ideas!.id)} />
        ) : (
          <p className="text-sm text-muted-foreground">{ai ? "برای گرفتن ایده‌های آماده ضبط، دکمه بالا را بزنید." : "بعد از تنظیم کلید Claude فعال می‌شود."}</p>
        )}
      </Card>

      <Card id="competitors" className="mb-6 scroll-mt-6">
        <h2 className="mb-1 font-semibold">رقبا</h2>
        <p className="mb-4 text-xs text-muted-foreground">وقتی پستی از رقیب چند برابر معمول بگیرد، به تیم خبر می‌دهیم.</p>
        {g.rivalSummary.length === 0 ? (
          <p className="text-sm text-muted-foreground">هنوز رقیبی اضافه نشده است؛ از بخش «پیج‌ها و آمار» پایین صفحه اضافه کنید.</p>
        ) : (
          <ul className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.rivalSummary.map(({ account, followers, change30, best }) => (
              <li key={account.id} className="rounded-lg border border-border p-3">
                <a href={`https://www.instagram.com/${account.username}/`} target="_blank" rel="noreferrer" className="ltr block text-right font-medium hover:text-primary">
                  @{account.username}
                </a>
                <p className="mt-1 text-sm">
                  {followers != null ? `${compact(followers)} فالوور` : "فالوور ثبت نشده"} {change30 != null && <span className="text-xs">· ۳۰ روز <Delta value={change30} /></span>}
                </p>
                {best && <p className="mt-1 truncate text-xs text-muted-foreground">بهترین پست ماه: {best.caption || TYPE_LABELS[best.type]}</p>}
                {account.lastError && <p className="mt-1 text-xs text-danger">خطای دریافت: {account.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
        {g.spikes.length > 0 && (
          <>
            <h3 className="mb-2 text-sm font-semibold">پست‌هایی که گرفتند</h3>
            <ul className="space-y-3">
              {g.spikes.map(({ insight, post }) => {
                const d = insight.data as Spike;
                return (
                  <li key={insight.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="ltr font-medium">@{d.username}</span> · {toPersianDigits(d.ratio)} برابر معمول
                        {post && ` · ${formatJalaliDate(post.postedAt)}`}
                      </span>
                      {post?.permalink && (
                        <a href={post.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
                          دیدن پست <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    {post?.caption && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.caption}</p>}
                    {d.why ? (
                      <div className="mt-2">
                        <p>{d.why}</p>
                        <ul className="mt-1 list-disc pr-5 text-xs">{d.takeaways?.map((t, i) => <li key={i}>{t}</li>)}</ul>
                      </div>
                    ) : (
                      ai && (
                        <div className="mt-2">
                          <ActionButton action={explainSpikeAction.bind(null, clientId, insight.id)} pendingLabel="در حال تحلیل…" variant="ghost" className="h-8 px-2 text-xs">
                            چرا گرفت؟
                          </ActionButton>
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {g.accounts.length > 0 && (
        <Card id="accounts" className="scroll-mt-6">
          <h2 className="mb-4 font-semibold">پیج‌ها و آمار</h2>
          {g.accounts.length > 0 && (
            <ul className="mb-6 divide-y divide-border">
              {g.accounts.map((a) => (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="ltr font-medium">@{a.username}</span>
                      <Badge tone={a.kind === "own" ? "primary" : "neutral"}>{a.kind === "own" ? "پیج مشتری" : "رقیب"}</Badge>
                      {a.kind === "own" && (a.accessToken ? <Badge tone="success">وصل به API</Badge> : <Badge>ورود دستی</Badge>)}
                    </div>
                    <div className="flex items-center gap-1">
                      {(a.accessToken || a.kind === "competitor") && (
                        <ActionButton action={syncNow.bind(null, clientId, a.id)} pendingLabel="…" variant="ghost" className="h-8 px-2">
                          <RefreshCw className="size-4" />
                          <span className="sr-only">به‌روزرسانی</span>
                        </ActionButton>
                      )}
                      {(a.kind === "competitor" || user.role === "admin") && (
                        <form action={removeAccount.bind(null, clientId, a.id)}>
                          <button type="submit" title="حذف" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-danger">
                            <Trash2 className="size-4" />
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  {a.lastError && <p className="mt-1 text-xs text-danger">آخرین خطا: {a.lastError}</p>}
                  {a.kind === "own" && user.role === "admin" && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-primary">{a.accessToken ? "تغییر اتصال API" : "اتصال به API اینستاگرام (اختیاری)"}</summary>
                      <ConnectForm action={connectAccount.bind(null, clientId, a.id)} />
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-8 lg:grid-cols-2">
            {g.own.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold">افزودن پیج یا رقیب</h3>
                <AddAccountForm action={addAccount.bind(null, clientId)} hasOwn />
              </section>
            )}
            {g.own.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold">ثبت دستی آمار یک روز</h3>
                <DailyEntryForm
                  action={addDailyEntry.bind(null, clientId)}
                  accounts={g.own.map((a) => ({ id: a.id, username: a.username }))}
                  today={isoDateToJalali(tehranDay())}
                />
              </section>
            )}
            {g.accounts.length > 0 && (
              <section className="lg:col-span-2">
                <h3 className="mb-3 text-sm font-semibold">ورود از فایل (خروجی Meta Business Suite، نوین‌هاب یا اکسل)</h3>
                <CsvImportForm action={importCsv.bind(null, clientId)} accounts={g.accounts.map((a) => ({ id: a.id, username: a.username }))} />
              </section>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

function StatCard({ label, value, extra, extraLabel }: { label: string; value: React.ReactNode; extra?: React.ReactNode; extraLabel?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-bold">{value}</dd>
      {extra && <p className="mt-1 text-xs text-muted-foreground">{extraLabel} {extra}</p>}
    </div>
  );
}

function SlotList({ slots }: { slots: { label: string; avg: number; posts: number }[] }) {
  const max = Math.max(...slots.map((s) => s.avg), 1);
  return (
    <ul className="space-y-2">
      {slots.map((s) => (
        <li key={s.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{s.label}</span>
            <span className="text-xs text-muted-foreground">{compact(s.avg)} · {toPersianDigits(s.posts)} پست</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(s.avg / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PostList({ posts }: { posts: Awaited<ReturnType<typeof loadGrowth>>["top"] }) {
  return (
    <ul className="space-y-2">
      {posts.map((p) => {
        const er = engagementRate(p);
        return (
          <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{p.caption || TYPE_LABELS[p.type]}</span>
              <span className="text-xs text-muted-foreground">
                {TYPE_LABELS[p.type]} · {formatJalaliDate(p.postedAt)}
                {er != null && ` · تعامل ${toPersianDigits(er.toFixed(1))}٪`}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 font-medium">
              {compact(performance(p))}
              {p.permalink && (
                <a href={p.permalink} target="_blank" rel="noreferrer" className="text-primary" aria-label="دیدن در اینستاگرام">
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
