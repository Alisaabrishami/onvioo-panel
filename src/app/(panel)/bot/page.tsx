import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { BotConnect } from "@/components/bot-connect";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireTeam } from "@/lib/auth/dal";
import { PLATFORMS, PLATFORM_KEYS, botConfigured, botUsername, teamChatId, webhookUrl } from "@/lib/bot";
import { registerWebhook, testTeamChat } from "@/app/bot-actions";

export const metadata: Metadata = { title: "ربات بله و تلگرام" };

const PERKS = [
  "اعلان کار جدید، تأیید و اصلاحیه مشتری و تیکت‌ها همین‌جا می‌آید",
  "«کارهای من»: با یک دکمه کار را انجام‌شده کنید",
  "«ورود» و «خروج»: ساعت کار بدون باز کردن پنل",
  "هر صبح برنامه همان روز: ضبط‌ها، مهلت‌ها و کارهای دیرشده",
];

export default async function BotPage() {
  const user = await requireTeam();
  return (
    <>
      <PageHeader title="ربات بله و تلگرام" description="پنل را در پیام‌رسان همراه داشته باشید" />
      <div className="max-w-4xl space-y-6">
        <BotConnect userId={user.id} perks={PERKS} />
        {user.role === "admin" && <AdminSetup />}
      </div>
    </>
  );
}

async function AdminSetup() {
  const rows = await Promise.all(
    PLATFORM_KEYS.map(async (p) => ({ p, ready: botConfigured(p), username: botConfigured(p) ? await botUsername(p) : null, group: !!teamChatId(p) })),
  );
  const hookReady = !!webhookUrl("bale")?.startsWith("https://");
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">راه‌اندازی (فقط مدیر)</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          توکن ربات را از BotFather بگیرید و در تنظیمات سرور بگذارید (BALE_BOT_TOKEN یا TELEGRAM_BOT_TOKEN). برای اینکه دکمه‌ها کار کنند، BOT_WEBHOOK_SECRET را هم بگذارید و یک بار «ثبت وب‌هوک» را بزنید.
        </p>
      </div>
      <ul className="divide-y divide-border text-sm">
        {rows.map(({ p, ready, username, group }) => (
          <li key={p} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{PLATFORMS[p].label}</span>
              {ready ? <Badge tone="success">توکن دارد</Badge> : <Badge tone="warning">بدون توکن</Badge>}
              {username && <span dir="ltr" className="text-xs text-muted-foreground">@{username}</span>}
              <Badge tone={group ? "info" : "neutral"}>{group ? "گروه تیم وصل است" : "گروه تیم ندارد"}</Badge>
            </span>
            {ready && hookReady && (
              <ActionButton action={registerWebhook.bind(null, p)} pendingLabel="در حال ثبت…" className="h-8 px-3 text-xs">
                ثبت وب‌هوک
              </ActionButton>
            )}
          </li>
        ))}
      </ul>
      {!hookReady && <p className="text-xs text-warning">برای ثبت وب‌هوک، APP_URL باید آدرس https پنل باشد و BOT_WEBHOOK_SECRET تنظیم شود.</p>}
      <ActionButton action={testTeamChat} pendingLabel="در حال فرستادن…" className="h-8 px-3 text-xs">
        پیام آزمایشی به گروه تیم
      </ActionButton>
    </Card>
  );
}
