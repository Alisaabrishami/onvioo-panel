import { and, count, eq, gte, ne, sum } from "drizzle-orm";
import { Clapperboard, FolderUp, ListTodo, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { formatBytes, formatJalaliLong, startOfJalaliMonth, toPersianDigits } from "@/lib/format";
import { FileList } from "../files/file-list";

export const metadata: Metadata = { title: "داشبورد" };

export default async function DashboardPage() {
  const user = await requireTeam();
  const [[activeClients], [inProgress], [myTasks], [monthFiles]] = await Promise.all([
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
  ]);

  const stats = [
    { label: "کارهای باز من", value: toPersianDigits(myTasks.value), icon: ListTodo, href: "/tasks" },
    { label: "محتوا در جریان تولید", value: toPersianDigits(inProgress.value), icon: Clapperboard, href: "/content" },
    { label: "مشتری فعال", value: toPersianDigits(activeClients.value), icon: Users, href: "/clients" },
    {
      label: "فایل‌های این ماه",
      value: toPersianDigits(monthFiles.value),
      hint: formatBytes(Number(monthFiles.bytes ?? 0)),
      icon: FolderUp,
      href: "/files",
    },
  ];

  return (
    <>
      <PageHeader title={`سلام ${user.name}`} description={formatJalaliLong(new Date())} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, hint, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="flex h-full items-center gap-4 transition-colors hover:border-primary/50">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <Card>
        <h2 className="mb-1 font-semibold">آخرین آپلودها</h2>
        <FileList limit={8} />
      </Card>
    </>
  );
}
