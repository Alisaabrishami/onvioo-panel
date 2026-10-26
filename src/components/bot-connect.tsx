import { eq } from "drizzle-orm";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { db, schema } from "@/db";
import { PLATFORMS, PLATFORM_KEYS, botConfigured } from "@/lib/bot";
import { formatJalaliDate } from "@/lib/format";
import { unlinkChat } from "@/app/bot-actions";
import { ConnectButton } from "./bot-connect-button";

// One card per messenger: connected (with a disconnect button) or a button
// that hands out a one-time code and a deep link to the bot
export async function BotConnect({ userId, perks }: { userId: string; perks: string[] }) {
  const links = await db.select().from(schema.chatLinks).where(eq(schema.chatLinks.userId, userId));
  return (
    <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
      {PLATFORM_KEYS.map((p) => {
        const link = links.find((l) => l.platform === p);
        const ready = botConfigured(p);
        return (
          <Card key={p} className="space-y-3" data-testid={`bot-${p}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <MessageCircle className="size-5 text-primary" />
                ربات {PLATFORMS[p].label}
              </h2>
              {link ? <Badge tone="success">وصل است</Badge> : ready ? <Badge>وصل نیست</Badge> : <Badge tone="warning">تنظیم نشده</Badge>}
            </div>
            {link ? (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 text-success" />
                  {link.username ? <span dir="ltr">@{link.username}</span> : "گفتگوی شما"} از {formatJalaliDate(link.createdAt)}
                </p>
                <form action={unlinkChat.bind(null, p)}>
                  <button type="submit" className="text-sm text-muted-foreground hover:text-danger">قطع اتصال</button>
                </form>
              </>
            ) : ready ? (
              <ConnectButton platform={p} label={PLATFORMS[p].label} />
            ) : (
              <p className="text-sm text-muted-foreground">مدیر پنل هنوز توکن ربات {PLATFORMS[p].label} را روی سرور نگذاشته است.</p>
            )}
            <ul className="list-disc space-y-1 pr-5 text-xs leading-6 text-muted-foreground">
              {perks.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
