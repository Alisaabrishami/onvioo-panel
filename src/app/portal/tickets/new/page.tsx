import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { createTicket } from "../actions";
import { TicketForm } from "../ticket-form";

export const metadata: Metadata = { title: "تیکت جدید" };

export default async function NewTicketPage() {
  const user = await requireClient();
  const projects = await db
    .select({ id: schema.projects.id, name: schema.projects.title })
    .from(schema.projects)
    .where(eq(schema.projects.clientId, user.clientId))
    .orderBy(asc(schema.projects.title));
  return (
    <>
      <PageHeader title="تیکت پشتیبانی جدید" description="تیم Onvioo پاسخ را همین‌جا و با پیامک خبر می‌دهد" />
      <Card>
        <TicketForm action={createTicket} projects={projects} />
      </Card>
    </>
  );
}
