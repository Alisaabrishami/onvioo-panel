import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/auth/dal";
import { clientOptions, isUuid, teamOptions } from "@/lib/data";
import { createProject } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "پروژه جدید" };

export default async function NewProjectPage(props: PageProps<"/projects/new">) {
  await requireTeam();
  const sp = await props.searchParams;
  const [clients, team] = await Promise.all([clientOptions(), teamOptions()]);
  return (
    <>
      <PageHeader title="پروژه سایت جدید" />
      <Card className="max-w-3xl">
        <ProjectForm action={createProject} clients={clients} team={team} initial={{ clientId: isUuid(sp.client) ? sp.client : "" }} submitLabel="ثبت پروژه" isNew />
      </Card>
    </>
  );
}
