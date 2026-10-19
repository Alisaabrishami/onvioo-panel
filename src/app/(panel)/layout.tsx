import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { logout } from "@/app/login/actions";
import { PanelNav, UserMenu } from "./panel-nav";
import { requireTeam } from "@/lib/auth/dal";

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-l">
        <div className="flex items-center justify-between gap-2 px-4 py-3 md:py-5">
          <div className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
              O
            </span>
            پنل Onvioo
          </div>
          <form action={logout} className="md:hidden">
            <button type="submit" title="خروج" className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
        <Suspense fallback={<div className="h-10 md:flex-1" />}>
          <NavForUser />
        </Suspense>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

async function NavForUser() {
  const user = await requireTeam();
  return (
    <>
      <PanelNav role={user.role} />
      <UserMenu name={user.name} role={user.role} />
    </>
  );
}
