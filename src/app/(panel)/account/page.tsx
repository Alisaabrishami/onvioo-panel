import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";
import { PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "حساب من" };

export default async function AccountPage() {
  const user = await requireTeam();
  return (
    <>
      <PageHeader title="حساب من" description="مشخصات و دستگاه‌هایی که با حساب شما وارد شده‌اند" />
      <AccountView user={user} />
    </>
  );
}
