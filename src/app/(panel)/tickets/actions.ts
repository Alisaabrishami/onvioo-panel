"use server";

import { requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, typedValues } from "@/lib/forms";
import { opsFormState } from "@/lib/ops/errors";
import { postMessage, setTicketStatus as setStatus } from "@/lib/ops/tickets";

export async function replyTicket(ticketId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  try {
    await postMessage(user, ticketId, { body: String(formData.get("body") ?? ""), fileIds: formData.getAll("fileIds").map(String) });
    return { ok: true };
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
}

export async function setTicketStatus(ticketId: string, status: "open" | "closed"): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(ticketId)) return;
  await setStatus(user, ticketId, status).catch((error) => opsFormState(error));
}
