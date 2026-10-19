import { eq } from "drizzle-orm";
import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui";
import { db, schema } from "@/db";
import { logout } from "@/app/login/actions";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "پرتال مشتری" };

export default function PortalPage() {
  return (
    <main className="mx-auto max-w-2xl p-4 md:p-8">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
        <PortalHome />
      </Suspense>
    </main>
  );
}

async function PortalHome() {
  const user = await requireUser(["client"]);
  const [client] = user.clientId
    ? await db.select().from(schema.clients).where(eq(schema.clients.id, user.clientId))
    : [];

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">سلام {user.name}</h1>
          {client && <p className="text-sm text-muted-foreground">{client.brand ?? client.name}</p>}
        </div>
        <form action={logout}>
          <button type="submit" title="خروج" className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
            <LogOut className="size-5" />
          </button>
        </form>
      </div>
      <Card className="text-sm leading-7 text-muted-foreground">
        به پرتال Onvioo خوش آمدید. به‌زودی وضعیت تدوین محتوا، تقویم انتشار، تأیید ویدیوها و آمار پیجتان
        را همین‌جا می‌بینید.
      </Card>
    </>
  );
}
