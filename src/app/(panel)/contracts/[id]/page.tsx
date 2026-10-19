import { eq } from "drizzle-orm";
import { Send, Trash2, Undo2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument } from "@/components/contract-document";
import { PrintButton } from "@/components/print-button";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { contractHash } from "@/lib/contract-hash";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONES } from "@/lib/contracts";
import { clientOptions, isUuid } from "@/lib/data";
import { formatJalaliDateTime, isoDateToJalali } from "@/lib/format";
import { deleteContract, sendContract, updateContract, withdrawContract } from "../actions";
import { ContractForm } from "../contract-form";

export const metadata: Metadata = { title: "قرارداد" };

export default async function ContractPage(props: PageProps<"/contracts/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ contract: schema.contracts, clientName: schema.clients.name })
    .from(schema.contracts)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clientId))
    .where(eq(schema.contracts.id, id));
  if (!row) notFound();
  const c = row.contract;
  const intact = c.bodyHash === null || c.bodyHash === contractHash(c);

  return (
    <>
      <PageHeader
        title={c.title}
        description={row.clientName}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={CONTRACT_STATUS_TONES[c.status]}>{CONTRACT_STATUS_LABELS[c.status]}</Badge>
            {c.status !== "draft" && <PrintButton />}
          </div>
        }
      />
      {c.status === "draft" ? (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <p className="text-sm text-muted-foreground">
              بعد از ارسال، مشتری در پرتال متن را می‌بیند و با کد پیامکی امضا می‌کند.
            </p>
            <div className="flex gap-2">
              <form action={sendContract.bind(null, c.id)}>
                <Button type="submit"><Send className="size-4" />ارسال برای امضا</Button>
              </form>
              <form action={deleteContract.bind(null, c.id)}>
                <Button type="submit" variant="ghost" className="text-muted-foreground hover:text-danger"><Trash2 className="size-4" />حذف</Button>
              </form>
            </div>
          </Card>
          <Card className="max-w-4xl">
            <ContractForm
              action={updateContract.bind(null, c.id)}
              clients={await clientOptions()}
              initial={{
                clientId: c.clientId,
                title: c.title,
                body: c.body,
                amount: c.amount === null ? "" : String(c.amount),
                startsOn: isoDateToJalali(c.startsOn),
                endsOn: isoDateToJalali(c.endsOn),
              }}
              submitLabel="ذخیره پیش‌نویس"
            />
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          {c.status === "sent" && (
            <Card className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <p className="text-sm text-muted-foreground">
                {c.sentAt && `ارسال‌شده در ${formatJalaliDateTime(c.sentAt)}؛ `}منتظر امضای مشتری.
              </p>
              <div className="flex gap-2">
                <form action={withdrawContract.bind(null, c.id, "draft")}>
                  <Button type="submit" variant="outline"><Undo2 className="size-4" />برگرداندن برای ویرایش</Button>
                </form>
                <form action={withdrawContract.bind(null, c.id, "cancelled")}>
                  <Button type="submit" variant="ghost" className="text-muted-foreground hover:text-danger"><XCircle className="size-4" />لغو</Button>
                </form>
              </div>
            </Card>
          )}
          {c.status === "signed" && (
            <p className={intact ? "text-sm text-success print:hidden" : "text-sm font-medium text-danger print:hidden"}>
              {intact ? "✓ متن قرارداد دقیقاً همان متنی است که مشتری امضا کرده." : "هشدار: متن فعلی با متنی که امضا شده یکی نیست."}
            </p>
          )}
          <ContractDocument doc={{ ...c, clientName: row.clientName }} />
        </div>
      )}
    </>
  );
}
