import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { markAllRead } from "@/app/notifications-actions";
import { formatJalaliDateTime } from "@/lib/format";
import { recentNotifications } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export async function NotificationList({ userId }: { userId: string }) {
  const rows = await recentNotifications(userId);
  if (rows.length === 0) return <EmptyState>اعلانی ندارید.</EmptyState>;
  const hasUnread = rows.some((n) => !n.readAt);
  return (
    <>
      {hasUnread && (
        <form action={markAllRead} className="mb-3">
          <button type="submit" className="text-sm text-primary hover:underline">همه را خوانده‌شده کن</button>
        </form>
      )}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {rows.map((n) => {
          const inner = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className={cn("text-sm", !n.readAt && "font-semibold")}>
                  {!n.readAt && <span className="ml-2 inline-block size-2 rounded-full bg-primary align-middle" />}
                  {n.title}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">{formatJalaliDateTime(n.createdAt)}</span>
              </div>
              {n.body && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.body}</p>}
            </>
          );
          return (
            <li key={n.id}>
              {n.href ? (
                <Link href={n.href} className="block p-4 hover:bg-muted/50">{inner}</Link>
              ) : (
                <div className="p-4">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
