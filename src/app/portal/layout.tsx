import { eq } from "drizzle-orm";
import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { logout } from "@/app/login/actions";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { unreadCount } from "@/lib/notifications";
import { PortalNav } from "./portal-nav";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 print:hidden border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4">
          <Suspense fallback={<div className="h-[104px]" />}>
            <PortalHeader />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 md:py-8">{children}</main>
    </div>
  );
}

async function PortalHeader() {
  const user = await requireClient();
  const [[client], unread] = await Promise.all([
    db.select({ name: schema.clients.name, brand: schema.clients.brand }).from(schema.clients).where(eq(schema.clients.id, user.clientId)),
    unreadCount(user.id),
  ]);
  return (
    <>
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">O</span>
          <div className="leading-tight">
            <p className="text-sm font-bold">{client?.brand ?? client?.name}</p>
            <p className="text-xs text-muted-foreground">پرتال Onvioo · {user.name}</p>
          </div>
        </div>
        <form action={logout}>
          <button type="submit" title="خروج" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-danger">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
      <div className="pb-2">
        <PortalNav unread={unread} />
      </div>
    </>
  );
}
