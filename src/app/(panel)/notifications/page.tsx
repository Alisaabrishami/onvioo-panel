import type { Metadata } from "next";
import { NotificationList } from "@/components/notification-list";
import { PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "اعلان‌ها" };

export default async function NotificationsPage() {
  const user = await requireTeam();
  return (
    <>
      <PageHeader title="اعلان‌ها" description="تأیید و اصلاحیه مشتری‌ها، تیکت‌ها، امضای قرارداد و کارهای جدید" />
      <div className="max-w-3xl">
        <NotificationList userId={user.id} />
      </div>
    </>
  );
}
