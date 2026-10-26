import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/auth/dal";
import { clientOptions, isUuid, shootOptions, teamOptions } from "@/lib/data";
import { createContent } from "../actions";
import { ContentForm } from "../content-form";

export const metadata: Metadata = { title: "محتوای جدید" };

export default async function NewContentPage(props: PageProps<"/content/new">) {
  await requireTeam();
  const sp = await props.searchParams;
  const [clients, team, shoots] = await Promise.all([clientOptions(), teamOptions(), shootOptions()]);
  const shootId = isUuid(sp.shoot) ? sp.shoot : "";
  const clientId = isUuid(sp.client) ? sp.client : "";

  return (
    <>
      <PageHeader title="محتوای جدید" description="ایده را ثبت کنید؛ بعد روی بورد مرحله‌به‌مرحله جلو می‌رود" />
      <Card className="max-w-3xl">
        <ContentForm
          action={createContent}
          clients={clients}
          team={team}
          shoots={shoots}
          initial={{ clientId, shootId }}
          submitLabel="ثبت محتوا"
        />
      </Card>
    </>
  );
}
