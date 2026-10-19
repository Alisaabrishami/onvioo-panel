import { eq } from "drizzle-orm";
import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { logout } from "@/app/login/actions";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { unreadCount } from "@/lib/notifications";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PortalNav } from "./portal-nav";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 px-2 pt-2 print:hidden md:px-4 md:pt-3">
        <div className="glass mx-auto max-w-4xl rounded-[28px] px-4">
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
        <Logo
          label={
            <div className="leading-tight">
              <p className="text-sm font-bold">{client?.brand ?? client?.name}</p>
              <p className="text-xs font-normal text-muted-foreground">پرتال Onvioo · {user.name}</p>
            </div>
          }
        />
        <div className="flex items-center">
          <ThemeToggle />
          <form action={logout}>
            <button type="submit" title="خروج" className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-danger">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
      <div className="pb-3">
        <PortalNav unread={unread} />
      </div>
    </>
  );
}
