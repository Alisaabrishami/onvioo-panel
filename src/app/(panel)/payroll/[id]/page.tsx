import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { formatJalaliDate, formatToman, isoDateToJalali, toPersianDigits } from "@/lib/format";
import { tehranDay } from "@/lib/growth";
import { financeAccounts } from "@/lib/finance-data";
import { formatMinutes, periodLabel } from "@/lib/payroll";
import { PAY_TYPE_LABELS, PAY_TYPE_UNITS } from "../../staff/labels";
import { deletePayslip, payPayslip, updatePayslip } from "../actions";
import { PayForm, PayslipForm } from "./forms";

export const metadata: Metadata = { title: "فیش حقوقی" };

export default async function PayslipPage(props: PageProps<"/payroll/[id]">) {
  const user = await requireTeam();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ slip: schema.payslips, name: schema.users.name, title: schema.staffProfiles.title })
    .from(schema.payslips)
    .innerJoin(schema.users, eq(schema.users.id, schema.payslips.userId))
    .leftJoin(schema.staffProfiles, eq(schema.staffProfiles.userId, schema.payslips.userId))
    .where(eq(schema.payslips.id, id));
  const isAdmin = user.role === "admin";
  // Staff see only their own slips, and only once paid
  if (!row || (!isAdmin && (row.slip.userId !== user.id || row.slip.status !== "paid"))) notFound();
  const s = row.slip;
  const accounts = isAdmin && s.status === "draft" ? (await financeAccounts()).filter((a) => a.active) : [];

  const lines = [
    { label: "پایه", value: s.base },
    { label: "اضافه‌کار", value: s.overtime },
    { label: "پاداش", value: s.bonus },
    { label: "کسورات", value: -s.deductions },
  ];

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`فیش حقوق ${row.name}`}
          description={periodLabel(s.period)}
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={s.status === "paid" ? "success" : "warning"}>{s.status === "paid" ? "پرداخت شد" : "پیش‌نویس"}</Badge>
              <PrintButton />
            </div>
          }
        />
        {isAdmin && <Link href={`/payroll?period=${s.period}`} className="mb-4 inline-block text-sm text-primary hover:underline">همه فیش‌های {periodLabel(s.period)}</Link>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="print:border-0 print:shadow-none">
          <div className="mb-6 flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-lg font-bold">{row.name}</p>
              {row.title && <p className="text-sm text-muted-foreground">{row.title}</p>}
            </div>
            <div className="text-left text-sm">
              <p className="font-semibold">Onvioo</p>
              <p className="text-muted-foreground">{periodLabel(s.period)}</p>
            </div>
          </div>
          <dl className="mb-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Info label="نوع حقوق" value={PAY_TYPE_LABELS[s.payType]} />
            <Info label="نرخ" value={`${formatToman(s.rate)} ${PAY_TYPE_UNITS[s.payType]}`} />
            <Info label="ساعت کار" value={formatMinutes(s.workedMinutes)} />
            <Info label="کار تحویل‌شده" value={toPersianDigits(s.items)} />
          </dl>
          <table className="w-full text-sm">
            <tbody>
              {lines.map((l) => (
                <tr key={l.label} className="border-b border-border">
                  <td className="py-2.5">{l.label}</td>
                  <td className={`py-2.5 text-left ${l.value < 0 ? "text-danger" : ""}`}>{l.value < 0 ? `− ${formatToman(-l.value)}` : formatToman(l.value)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-3 font-bold">خالص پرداختی</td>
                <td className="py-3 text-left text-lg font-bold">{formatToman(s.net)}</td>
              </tr>
            </tbody>
          </table>
          {s.note && <p className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">{s.note}</p>}
          {s.paidAt && <p className="mt-4 text-xs text-muted-foreground">پرداخت در {formatJalaliDate(s.paidAt)}</p>}
        </Card>
        {isAdmin && s.status === "draft" && (
          <div className="space-y-6 print:hidden">
            <Card>
              <h2 className="mb-4 font-semibold">ویرایش مبالغ</h2>
              <PayslipForm
                action={updatePayslip.bind(null, s.id)}
                initial={{ base: String(s.base), overtime: String(s.overtime), bonus: String(s.bonus), deductions: String(s.deductions), note: s.note ?? "" }}
              />
            </Card>
            <Card>
              <h2 className="mb-4 font-semibold">پرداخت</h2>
              <PayForm action={payPayslip.bind(null, s.id)} accounts={accounts} today={isoDateToJalali(tehranDay())} />
              <p className="mt-3 text-xs text-muted-foreground">پرداخت به‌عنوان هزینه «حقوق» در بخش مالی ثبت می‌شود و فیش برای {row.name} نمایش داده می‌شود.</p>
            </Card>
            <form action={deletePayslip.bind(null, s.id)}>
              <button type="submit" className="text-sm text-muted-foreground hover:text-danger">حذف این پیش‌نویس</button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
