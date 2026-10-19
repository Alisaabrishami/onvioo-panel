import { ShieldCheck } from "lucide-react";
import { formatIsoDate, formatJalaliDateTime, formatToman, toPersianDigits } from "@/lib/format";

export type ContractDoc = {
  title: string;
  body: string;
  amount: number | null;
  startsOn: string | null;
  endsOn: string | null;
  clientName: string;
  signedAt: Date | null;
  signerName: string | null;
  signerPhone: string | null;
  signerIp: string | null;
  bodyHash: string | null;
};

// The contract as both sides read and print it, with the signature evidence
export function ContractDocument({ doc, showEvidence = true }: { doc: ContractDoc; showEvidence?: boolean }) {
  return (
    <article className="rounded-xl border border-border bg-surface p-6 leading-8 shadow-sm print:border-0 print:p-0 print:shadow-none md:p-10">
      <header className="mb-6 border-b border-border pb-4 text-center">
        <h2 className="text-lg font-bold">{doc.title}</h2>
        <p className="text-sm text-muted-foreground">مجری: آژانس Onvioo · کارفرما: {doc.clientName}</p>
      </header>
      <dl className="mb-6 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">مبلغ کل</dt>
          <dd className="font-medium">{doc.amount !== null ? formatToman(doc.amount) : "طبق متن قرارداد"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">شروع</dt>
          <dd className="font-medium">{formatIsoDate(doc.startsOn) || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">پایان</dt>
          <dd className="font-medium">{formatIsoDate(doc.endsOn) || "—"}</dd>
        </div>
      </dl>
      <div className="whitespace-pre-line text-sm">{doc.body}</div>
      {doc.signedAt && (
        <footer className="mt-8 rounded-lg border border-success/40 bg-success/5 p-4 text-sm">
          <p className="mb-1 flex items-center gap-2 font-semibold text-success">
            <ShieldCheck className="size-4" />
            امضای دیجیتال کارفرما
          </p>
          <p>
            {doc.signerName} در {formatJalaliDateTime(doc.signedAt)} با کد یکبار مصرف ارسال‌شده به{" "}
            <span className="ltr inline-block">{doc.signerPhone && toPersianDigits(doc.signerPhone)}</span> این قرارداد را تأیید کرد.
          </p>
          {showEvidence && (
            <p className="mt-2 break-all text-xs text-muted-foreground">
              IP: <span className="ltr inline-block">{doc.signerIp ?? "—"}</span> · اثر انگشت متن (SHA-256):{" "}
              <span className="ltr inline-block font-mono">{doc.bodyHash}</span>
            </p>
          )}
        </footer>
      )}
    </article>
  );
}
