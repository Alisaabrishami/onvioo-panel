import { Monitor, Smartphone } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { signOutDevice, signOutOthers } from "@/app/account-actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { currentSessionHash } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";
import { formatJalaliDate, formatJalaliDateTime } from "@/lib/format";
import { listSessions } from "@/lib/ops/sessions";

// Profile and signed-in devices, for both the panel and the portal
export async function AccountView({ user, clientName }: { user: SessionUser; clientName?: string | null }) {
  const sessions = await listSessions(user.id, await currentSessionHash());
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="max-w-3xl space-y-6">
      <Card className="animate-rise">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">نام</dt>
            <dd className="mt-1 font-semibold">{user.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">موبایل</dt>
            <dd className="mt-1 font-semibold" dir="ltr">{user.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">نقش</dt>
            <dd className="mt-1 font-semibold">{clientName ? `${ROLE_LABELS[user.role]} · ${clientName}` : ROLE_LABELS[user.role]}</dd>
          </div>
        </dl>
      </Card>

      <Card className="animate-rise space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">دستگاه‌های وارد شده</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              مرورگرها و اپ‌هایی که با این حساب وارد شده‌اند. اگر دستگاهی را نمی‌شناسید، از آن خارج شوید.
            </p>
          </div>
          {others > 0 && (
            <form action={signOutOthers}>
              <Button type="submit" variant="outline" className="h-8 px-3 text-xs">خروج از همه دستگاه‌های دیگر</Button>
            </form>
          )}
        </div>
        <ul className="divide-y divide-border">
          {sessions.map((s) => {
            const Icon = s.kind === "app" ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {s.device}
                    {s.detail && <span className="text-xs font-normal text-muted-foreground">{s.detail}</span>}
                    {s.current && <Badge tone="success">همین دستگاه</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    ورود {formatJalaliDateTime(s.createdAt)} · اعتبار تا {formatJalaliDate(s.expiresAt)}
                  </p>
                </div>
                {!s.current && (
                  <form action={signOutDevice.bind(null, s.id)}>
                    <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger">
                      خروج
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
