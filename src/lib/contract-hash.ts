import "server-only";
import { createHash } from "node:crypto";

export type ContractTerms = {
  title: string;
  body: string;
  amount: number | null;
  startsOn: string | null;
  endsOn: string | null;
};

// Fingerprint of everything the client agrees to. Stored at signing so any
// later edit to the text is detectable.
export function contractHash(terms: ContractTerms): string {
  const canonical = JSON.stringify([terms.title, terms.body, terms.amount, terms.startsOn, terms.endsOn]);
  return createHash("sha256").update(canonical).digest("hex");
}
