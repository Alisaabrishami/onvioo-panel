import type { Metadata } from "next";
import { BotConnect } from "@/components/bot-connect";
import { PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "ربات بله و تلگرام" };

const PERKS = [
  "وقتی محتوایی آماده بررسی شد، همان‌جا با یک دکمه تأیید کنید یا اصلاحیه بنویسید",
  "یادآوری و لینک پرداخت فاکتورها",
  "گزارش ماهانه پیج و کارهای انجام‌شده",
];

export default async function PortalBotPage() {
  const user = await requireClient();
  return (
    <>
      <PageHeader title="ربات بله و تلگرام" description="کارهای انوییو را در پیام‌رسان خودتان دنبال کنید" />
      <div className="max-w-4xl">
        <BotConnect userId={user.id} perks={PERKS} />
      </div>
    </>
  );
}
