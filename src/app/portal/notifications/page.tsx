import type { Metadata } from "next";
import { NotificationList } from "@/components/notification-list";
import { PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "اعلان‌ها" };

export default async function PortalNotificationsPage() {
  const user = await requireClient();
  return (
    <>
      <PageHeader title="اعلان‌ها" />
      <NotificationList userId={user.id} />
    </>
  );
}
