import { and, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractDocument } from "@/components/contract-document";
import { PrintButton } from "@/components/print-button";
import { Badge, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireClient } from "@/lib/auth/dal";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONES } from "@/lib/contracts";
import { isUuid } from "@/lib/data";
import { sendSignCode, signContract } from "../actions";
import { SignPanel } from "./sign-panel";

export const metadata: Metadata = { title: "قرارداد" };

export default async function PortalContractPage(props: PageProps<"/portal/contracts/[id]">) {
  const user = await requireClient();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ contract: schema.contracts, clientName: schema.clients.name })
    .from(schema.contracts)
    .innerJoin(schema.clients, eq(schema.clients.id, schema.contracts.clientId))
    // Drafts stay with the agency until they are sent
    .where(and(eq(schema.contracts.id, id), eq(schema.contracts.clientId, user.clientId), ne(schema.contracts.status, "draft")));
  if (!row) notFound();
  const c = row.contract;

  return (
    <>
      <PageHeader
        title={c.title}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={CONTRACT_STATUS_TONES[c.status]}>{CONTRACT_STATUS_LABELS[c.status]}</Badge>
            <PrintButton />
          </div>
        }
      />
      <div className="space-y-6">
        <ContractDocument doc={{ ...c, clientName: row.clientName }} showEvidence={false} />
        {c.status === "sent" && (
          <SignPanel phone={user.phone} sendCode={sendSignCode.bind(null, c.id)} sign={signContract.bind(null, c.id)} />
        )}
      </div>
    </>
  );
}
