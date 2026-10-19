import { and, count, eq, gte, ne, sum } from "drizzle-orm";
import { FolderUp, UserCog, Users } from "lucide-react";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { formatBytes, formatJalaliLong, startOfJalaliMonth, toPersianDigits } from "@/lib/format";
import { FileList } from "../files/file-list";

export const metadata: Metadata = { title: "داشبورد" };

export default async function DashboardPage() {
  const user = await requireTeam();
  const [[activeClients], [team], [monthFiles]] = await Promise.all([
    db.select({ value: count() }).from(schema.clients).where(eq(schema.clients.status, "active")),
    db
      .select({ value: count() })
      .from(schema.users)
      .where(and(ne(schema.users.role, "client"), eq(schema.users.active, true))),
    db
      .select({ value: count(), bytes: sum(schema.files.size) })
      .from(schema.files)
      .where(gte(schema.files.createdAt, startOfJalaliMonth())),
  ]);

  const stats = [
    { label: "مشتری فعال", value: toPersianDigits(activeClients.value), icon: Users },
    { label: "اعضای تیم", value: toPersianDigits(team.value), icon: UserCog },
    {
      label: "فایل‌های این ماه",
      value: toPersianDigits(monthFiles.value),
      hint: formatBytes(Number(monthFiles.bytes ?? 0)),
      icon: FolderUp,
    },
  ];

  return (
    <>
      <PageHeader title={`سلام ${user.name}`} description={formatJalaliLong(new Date())} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, hint, icon: Icon }) => (
          <Card key={label} className="flex items-center gap-4">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-1 font-semibold">آخرین آپلودها</h2>
        <FileList limit={8} />
      </Card>
    </>
  );
}
