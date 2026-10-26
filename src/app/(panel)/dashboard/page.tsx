import { and, count, eq, gte, ne, sum } from "drizzle-orm";
import { ArrowUpLeft, Clapperboard, FolderUp, ListTodo, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, toneClasses, type Tone } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { STAGES, STAGE_LABELS } from "@/lib/content";
import { formatBytes, formatJalaliLong, startOfJalaliMonth, toPersianDigits } from "@/lib/format";
import { FileList } from "../files/file-list";

export const metadata: Metadata = { title: "داشبورد" };

const PIPELINE_COLORS = {
  idea: "bg-muted-foreground/50",
  shot: "bg-sky",
  editing: "bg-sand",
  internal_review: "bg-coral",
  client_review: "bg-lilac",
  ready: "bg-mint",
} as const;

export default async function DashboardPage() {
  const user = await requireTeam();
  const [[activeClients], [inProgress], [myTasks], [monthFiles], byStage] = await Promise.all([
    db.select({ value: count() }).from(schema.clients).where(eq(schema.clients.status, "active")),
    db
      .select({ value: count() })
      .from(schema.contents)
      .where(and(ne(schema.contents.stage, "published"), ne(schema.contents.stage, "idea"))),
    db
      .select({ value: count() })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.assigneeId, user.id), ne(schema.tasks.status, "done"))),
    db
      .select({ value: count(), bytes: sum(schema.files.size) })
      .from(schema.files)
      .where(gte(schema.files.createdAt, startOfJalaliMonth())),
    db
      .select({ stage: schema.contents.stage, value: count() })
      .from(schema.contents)
      .where(ne(schema.contents.stage, "published"))
      .groupBy(schema.contents.stage),
  ]);
  const pipeline = STAGES.filter((s) => s !== "published").map((stage) => ({
    stage,
    value: byStage.find((r) => r.stage === stage)?.value ?? 0,
  }));
  const pipelineTotal = pipeline.reduce((n, p) => n + p.value, 0);

  const stats = [
    { label: "کارهای باز من", value: toPersianDigits(myTasks.value), icon: ListTodo, href: "/tasks", tone: "coral" },
    { label: "محتوا در جریان تولید", value: toPersianDigits(inProgress.value), icon: Clapperboard, href: "/content", tone: "sand" },
    { label: "مشتری فعال", value: toPersianDigits(activeClients.value), icon: Users, href: "/clients", tone: "mint" },
    {
      tone: "sky",
      label: "فایل‌های این ماه",
      value: toPersianDigits(monthFiles.value),
      hint: formatBytes(Number(monthFiles.bytes ?? 0)),
      icon: FolderUp,
      href: "/files",
    },
  ] satisfies { tone: Tone; [key: string]: unknown }[];

  return (
    <>
      <PageHeader title={`سلام ${user.name}`} description={formatJalaliLong(new Date())} />
      <div className="stagger mb-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, hint, icon: Icon, href, tone }, i) => (
          <Link
            key={label}
            href={href}
            style={{ "--i": i } as React.CSSProperties}
            className="glass group relative flex flex-col gap-4 rounded-3xl p-4 md:p-5 transition-[transform,border-color] duration-300 ease-spring hover:-translate-y-1 hover:border-border-strong"
          >
            <div className="flex items-center justify-between">
              <span className={`flex size-11 items-center justify-center rounded-2xl ${toneClasses[tone]} transition-transform duration-300 ease-spring group-hover:-rotate-6 group-hover:scale-110`}>
                <Icon className="size-5" />
              </span>
              <span className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors group-hover:border-primary group-hover:text-primary">
                <ArrowUpLeft className="size-4" />
              </span>
            </div>
            <div>
              <p className="text-3xl font-bold">{value}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {label}
                {hint && <span className="text-xs"> · {hint}</span>}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <Card className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">خط تولید محتوا</h2>
          <Link href="/content" className="text-sm text-muted-foreground hover:text-primary">بورد محتوا</Link>
        </div>
        {pipelineTotal === 0 ? (
          <p className="text-sm text-muted-foreground">محتوایی در جریان نیست.</p>
        ) : (
          <>
            <div className="flex h-3 gap-1 overflow-hidden rounded-full">
              {pipeline
                .filter((p) => p.value > 0)
                .map((p) => (
                  <span
                    key={p.stage}
                    title={`${STAGE_LABELS[p.stage]}: ${toPersianDigits(p.value)}`}
                    className={`h-full origin-right animate-[grow_0.9s_var(--ease-out-soft)_both] rounded-full ${PIPELINE_COLORS[p.stage]}`}
                    style={{ flexGrow: p.value }}
                  />
                ))}
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {pipeline.map((p) => (
                <li key={p.stage} className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${PIPELINE_COLORS[p.stage]}`} />
                  <span className="text-muted-foreground">{STAGE_LABELS[p.stage]}</span>
                  <span className="font-semibold">{toPersianDigits(p.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">آخرین آپلودها</h2>
        <FileList limit={8} />
      </Card>
    </>
  );
}
