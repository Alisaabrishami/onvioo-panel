import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { formatJalaliDate } from "@/lib/format";
import { storageConfigured } from "@/lib/storage";
import { FileList } from "../../files/file-list";
import { Uploader } from "../../files/uploader";
import { removePortalUser, updateClient } from "../actions";
import { ClientForm } from "../client-form";
import { CLIENT_STATUS_LABELS, CLIENT_STATUS_TONES } from "../labels";
import { PortalUserForm } from "./portal-user-form";

export const metadata: Metadata = { title: "مشتری" };

export default async function ClientPage(props: PageProps<"/clients/[id]">) {
  const user = await requireTeam();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
  if (!client) notFound();

  const portalUsers = await db
    .select({ id: schema.users.id, name: schema.users.name, phone: schema.users.phone })
    .from(schema.users)
    .where(and(eq(schema.users.clientId, id), eq(schema.users.role, "client")))
    .orderBy(asc(schema.users.createdAt));

  const isAdmin = user.role === "admin";

  return (
    <>
      <PageHeader
        title={client.name}
        description={`ثبت‌شده در ${formatJalaliDate(client.createdAt)}`}
        actions={<Badge tone={CLIENT_STATUS_TONES[client.status]}>{CLIENT_STATUS_LABELS[client.status]}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {isAdmin ? (
            <Card>
              <h2 className="mb-4 font-semibold">اطلاعات مشتری</h2>
              <ClientForm action={updateClient.bind(null, client.id)} initial={client} submitLabel="ذخیره تغییرات" />
            </Card>
          ) : (
            <Card className="space-y-2 text-sm">
              <h2 className="mb-2 font-semibold">اطلاعات مشتری</h2>
              {client.brand && <p>برند: {client.brand}</p>}
              {client.instagram && <p>اینستاگرام: <span className="ltr">@{client.instagram}</span></p>}
              {client.phone && <p>تلفن: <span className="ltr">{client.phone}</span></p>}
              {client.notes && <p className="whitespace-pre-line text-muted-foreground">{client.notes}</p>}
            </Card>
          )}
          <Card>
            <h2 className="mb-1 font-semibold">فایل‌های این مشتری</h2>
            <FileList clientId={client.id} />
          </Card>
        </div>
        <div className="space-y-6">
          {storageConfigured() && (
            <Card>
              <h2 className="mb-3 font-semibold">آپلود برای {client.name}</h2>
              <Uploader fixedClientId={client.id} />
            </Card>
          )}
          <Card>
            <h2 className="mb-1 font-semibold">دسترسی پرتال مشتری</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              این افراد با کد پیامکی وارد پرتال مشتری می‌شوند.
            </p>
            {portalUsers.length > 0 && (
              <ul className="mb-4 divide-y divide-border text-sm">
                {portalUsers.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="ltr text-xs text-muted-foreground">{p.phone}</p>
                    </div>
                    {isAdmin && (
                      <form action={removePortalUser.bind(null, client.id, p.id)}>
                        <button type="submit" className="text-xs text-danger hover:underline">
                          حذف دسترسی
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isAdmin && <PortalUserForm clientId={client.id} />}
          </Card>
        </div>
      </div>
    </>
  );
}
