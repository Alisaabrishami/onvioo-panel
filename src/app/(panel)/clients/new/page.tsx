import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "../actions";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "مشتری جدید" };

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="مشتری جدید" />
      <Card>
        <ClientForm action={createClient} submitLabel="ثبت مشتری" />
      </Card>
    </>
  );
}
