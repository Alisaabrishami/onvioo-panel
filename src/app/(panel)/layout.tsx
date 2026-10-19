import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { logout } from "@/app/login/actions";
import { PanelNav, UserMenu } from "./panel-nav";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireTeam } from "@/lib/auth/dal";
import { unreadCount } from "@/lib/notifications";

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row md:gap-2 md:p-3">
      <aside className="glass sticky top-0 z-20 rounded-b-3xl border-t-0 print:hidden md:top-3 md:flex md:h-[calc(100dvh-1.5rem)] md:w-60 md:shrink-0 md:flex-col md:rounded-[28px] md:border-t">
        <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-5 md:py-5">
          <Logo label="پنل Onvioo" />
          <div className="flex items-center md:hidden">
            <ThemeToggle />
            <form action={logout}>
              <button type="submit" title="خروج" className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
        <Suspense fallback={<div className="h-11 md:flex-1" />}>
          <NavForUser />
        </Suspense>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  );
}

async function NavForUser() {
  const user = await requireTeam();
  const unread = await unreadCount(user.id);
  return (
    <>
      <PanelNav role={user.role} unread={unread} />
      <UserMenu name={user.name} role={user.role} />
    </>
  );
}
