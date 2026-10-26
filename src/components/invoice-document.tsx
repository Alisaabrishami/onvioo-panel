import type { InvoiceItem, InvoiceStatus } from "@/db/schema";
import { formatIsoDate, formatJalaliDateTime, formatToman, toPersianDigits } from "@/lib/format";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, invoiceTotals } from "@/lib/invoice";
import { Badge } from "./ui";

export type InvoiceDoc = {
  number: number | null;
  title: string;
  clientName: string;
  items: InvoiceItem[];
  discount: number;
  taxBp: number;
  issuedOn: string;
  dueOn: string | null;
  status: InvoiceStatus;
  note: string | null;
  paidAt: Date | null;
  refId?: string | null;
};

// The invoice as the client sees and prints it
export function InvoiceDocument({ doc }: { doc: InvoiceDoc }) {
  const t = invoiceTotals(doc.items, doc.discount, doc.taxBp);
  return (
    <article className="glass rounded-3xl p-6 print:border-0 print:p-0 print:shadow-none md:p-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs text-muted-foreground">صورتحساب</p>
          <h2 className="text-xl font-bold">فاکتور شماره {toPersianDigits(doc.number ?? 0)}</h2>
          <p className="mt-1 text-sm">{doc.title}</p>
        </div>
        <div className="text-left text-sm">
          <p className="font-bold">آژانس Onvioo</p>
          <Badge tone={INVOICE_STATUS_TONES[doc.status]} className="mt-1">{INVOICE_STATUS_LABELS[doc.status]}</Badge>
        </div>
      </header>
      <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">صورتحساب برای</dt>
          <dd className="font-medium">{doc.clientName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">تاریخ صدور</dt>
          <dd className="font-medium">{formatIsoDate(doc.issuedOn)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">مهلت پرداخت</dt>
          <dd className="font-medium">{formatIsoDate(doc.dueOn) || "—"}</dd>
        </div>
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-right font-medium">شرح</th>
              <th className="py-2 text-right font-medium">تعداد</th>
              <th className="py-2 text-right font-medium">مبلغ واحد</th>
              <th className="py-2 text-left font-medium">جمع</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {doc.items.map((i, n) => (
              <tr key={n}>
                <td className="py-2.5">{i.title}</td>
                <td className="py-2.5">{toPersianDigits(i.qty)}</td>
                <td className="py-2.5">{formatToman(i.unitPrice)}</td>
                <td className="py-2.5 text-left">{formatToman(Math.round(i.qty * i.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mr-auto mt-6 max-w-xs space-y-1.5 text-sm">
        <Row label="جمع" value={formatToman(t.subtotal)} />
        {doc.discount > 0 && <Row label="تخفیف" value={`− ${formatToman(doc.discount)}`} />}
        {doc.taxBp > 0 && <Row label={`مالیات بر ارزش افزوده (${toPersianDigits(doc.taxBp / 100)}٪)`} value={formatToman(t.tax)} />}
        <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
          <dt>مبلغ قابل پرداخت</dt>
          <dd>{formatToman(t.total)}</dd>
        </div>
      </dl>
      {doc.note && <p className="mt-6 whitespace-pre-line text-sm text-muted-foreground">{doc.note}</p>}
      {doc.paidAt && (
        <p className="mt-6 rounded-2xl bg-mint/20 px-4 py-3 text-sm">
          پرداخت‌شده در {formatJalaliDateTime(doc.paidAt)}
          {doc.refId && <> · کد پیگیری <span dir="ltr">{doc.refId}</span></>}
        </p>
      )}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
