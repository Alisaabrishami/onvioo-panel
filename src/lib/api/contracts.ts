import "server-only";
import type { schema } from "@/db";
import { appLink } from "@/lib/bot";
import { contractHash } from "@/lib/contract-hash";
import { CONTRACT_STATUS_LABELS } from "@/lib/contracts";
import type { ApiUser } from "./http";

type Contract = typeof schema.contracts.$inferSelect;

// A contract as the app sees it. `intact` says the signed text still matches
// the fingerprint taken at signing; clients never see who drafted it.
export function contractView(user: ApiUser, c: Contract) {
  const { createdBy, signerAgent, ...rest } = c;
  const client = user.role === "client";
  return {
    ...rest,
    ...(client ? {} : { createdBy, signerAgent }),
    statusLabel: CONTRACT_STATUS_LABELS[c.status],
    intact: c.status === "signed" && c.bodyHash ? contractHash(c) === c.bodyHash : null,
    pdfUrl: appLink(client ? `/portal/contracts/${c.id}` : `/contracts/${c.id}`),
  };
}
