import { asc, eq } from "drizzle-orm";
import { Plus, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { STAGE_LABELS, STAGE_TONES, TYPE_LABELS } from "@/lib/content";
import { clientOptions, isUuid, teamOptions } from "@/lib/data";
import { formatJalaliLong, formatTime, jalaliInputValue, toPersianDigits } from "@/lib/format";
import { deleteShoot, updateShoot } from "../actions";
import { ShootForm } from "../shoot-form";
import { Checklist } from "./checklist";

export const metadata: Metadata = { title: "جلسه ضبط" };

export default async function ShootPage(props: PageProps<"/shoots/[id]">) {
  const user = await requireTeam();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();

  const [shoot] = await db.select().from(schema.shoots).where(eq(schema.shoots.id, id));
  if (!shoot) notFound();

  const [contents, clients, team] = await Promise.all([
    db
      .select({ id: schema.contents.id, title: schema.contents.title, type: schema.contents.type, stage: schema.contents.stage })
      .from(schema.contents)
      .where(eq(schema.contents.shootId, id))
      .orderBy(asc(schema.contents.createdAt)),
    clientOptions(),
    teamOptions(),
  ]);
  const starts = jalaliInputValue(shoot.startsAt);

  return (
    <>
      <PageHeader
        title={shoot.title}
        description={`${formatJalaliLong(shoot.startsAt)} · ساعت ${formatTime(shoot.startsAt)} · ${toPersianDigits(shoot.durationMinutes)} دقیقه`}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <h2 className="mb-4 font-semibold">جزئیات جلسه</h2>
          <ShootForm
            action={updateShoot.bind(null, shoot.id)}
            clients={clients}
            team={team}
            initial={{
              title: shoot.title,
              clientId: shoot.clientId,
              startsAt: starts.date,
              startsAtTime: starts.time,
              durationMinutes: String(shoot.durationMinutes),
              location: shoot.location ?? "",
              crewId: shoot.crewId ?? "",
              script: shoot.script ?? "",
              checklist: shoot.checklist ?? "",
              notes: shoot.notes ?? "",
            }}
            submitLabel="ذخیره تغییرات"
          />
        </Card>
        <div className="space-y-6">
          {shoot.checklist && (
            <Card>
              <h2 className="mb-3 font-semibold">چک‌لیست تجهیزات</h2>
              <Checklist shootId={shoot.id} text={shoot.checklist} />
            </Card>
          )}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">محتواهای این جلسه</h2>
              <Link href={`/content/new?shoot=${shoot.id}&client=${shoot.clientId}`} className="flex items-center gap-1 text-sm text-primary hover:underline">
                <Plus className="size-4" />
                افزودن
              </Link>
            </div>
            {contents.length === 0 ? (
              <p className="text-sm text-muted-foreground">هنوز محتوایی به این جلسه وصل نشده است.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {contents.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/content/${c.id}`} className="hover:text-primary">
                      {c.title} <span className="text-xs text-muted-foreground">({TYPE_LABELS[c.type]})</span>
                    </Link>
                    <Badge tone={STAGE_TONES[c.stage]}>{STAGE_LABELS[c.stage]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {user.role === "admin" && (
            <form action={deleteShoot.bind(null, shoot.id)}>
              <button type="submit" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-danger">
                <Trash2 className="size-4" />
                حذف این جلسه
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
