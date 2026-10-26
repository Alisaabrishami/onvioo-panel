import { asc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { formatToman } from "@/lib/format";
import { setStaffActive } from "./actions";
import { PAY_TYPE_UNITS } from "./labels";
import { StaffForm } from "./staff-form";

export const metadata: Metadata = { title: "کارکنان" };

export default async function StaffPage() {
  const admin = await requireAdmin();
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      phone: schema.users.phone,
      role: schema.users.role,
      active: schema.users.active,
      title: schema.staffProfiles.title,
      payType: schema.staffProfiles.payType,
      rate: schema.staffProfiles.rate,
    })
    .from(schema.users)
    .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.userId, schema.users.id))
    .where(ne(schema.users.role, "client"))
    .orderBy(asc(schema.users.createdAt));

  return (
    <>
      <PageHeader title="کارکنان" description="اعضای تیم، نقش و نوع حقوق هر نفر" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.name}{" "}
                    {s.title && <span className="text-sm font-normal text-muted-foreground">· {s.title}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="ltr">{s.phone}</span>
                    {s.payType && s.rate !== null && s.rate > 0 && (
                      <> · {formatToman(s.rate)} {PAY_TYPE_UNITS[s.payType]}</>
                    )}
                  </p>
                </div>
                <Badge tone={s.role === "admin" ? "primary" : "neutral"}>{ROLE_LABELS[s.role]}</Badge>
                {!s.active && <Badge tone="danger">غیرفعال</Badge>}
                {s.id !== admin.id && (
                  <form action={setStaffActive.bind(null, s.id, !s.active)}>
                    <button type="submit" className="text-xs text-muted-foreground hover:text-primary hover:underline">
                      {s.active ? "غیرفعال کردن" : "فعال کردن"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">عضو جدید</h2>
          <StaffForm />
        </Card>
      </div>
    </>
  );
}
