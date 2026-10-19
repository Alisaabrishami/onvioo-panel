import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/auth/dal";
import { DEFAULT_CHECKLIST } from "@/lib/content";
import { clientOptions, isUuid, teamOptions } from "@/lib/data";
import { createShoot } from "../actions";
import { ShootForm } from "../shoot-form";

export const metadata: Metadata = { title: "جلسه ضبط جدید" };

export default async function NewShootPage(props: PageProps<"/shoots/new">) {
  await requireTeam();
  const sp = await props.searchParams;
  const [clients, team] = await Promise.all([clientOptions(), teamOptions()]);
  const date = typeof sp.date === "string" && /^\d{4}\/\d{2}\/\d{2}$/.test(sp.date) ? sp.date : "";
  return (
    <>
      <PageHeader title="جلسه ضبط جدید" />
      <Card className="max-w-3xl">
        <ShootForm
          action={createShoot}
          clients={clients}
          team={team}
          initial={{ checklist: DEFAULT_CHECKLIST, clientId: isUuid(sp.client) ? sp.client : "", startsAt: date, startsAtTime: date ? "10:00" : "" }}
          submitLabel="ثبت جلسه"
        />
      </Card>
    </>
  );
}
