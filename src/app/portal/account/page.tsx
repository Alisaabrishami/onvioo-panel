import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "حساب من" };

export default async function PortalAccountPage() {
  const user = await requireClient();
  const [client] = await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, user.clientId));
  return (
    <>
      <PageHeader title="حساب من" description="مشخصات و دستگاه‌هایی که با حساب شما وارد شده‌اند" />
      <AccountView user={user} clientName={client?.name} />
    </>
  );
}
