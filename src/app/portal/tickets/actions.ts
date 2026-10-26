"use server";

import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, typedValues } from "@/lib/forms";
import { opsFormState } from "@/lib/ops/errors";
import { openTicket, postMessage, setTicketStatus } from "@/lib/ops/tickets";

const fileIds = (formData: FormData) => formData.getAll("fileIds").map(String);

export async function createTicket(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  let id: string;
  try {
    const ticket = await openTicket(user, {
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      projectId: String(formData.get("projectId") ?? "") || null,
      priority: String(formData.get("priority") ?? "normal"),
      fileIds: fileIds(formData),
    });
    id = ticket.id;
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
  redirect(`/portal/tickets/${id}`);
}

export async function replyAsClient(ticketId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireClient();
  try {
    await postMessage(user, ticketId, { body: String(formData.get("body") ?? ""), fileIds: fileIds(formData) });
    return { ok: true };
  } catch (error) {
    return opsFormState(error, typedValues(formData));
  }
}

export async function closeOwnTicket(ticketId: string): Promise<void> {
  const user = await requireClient();
  if (!isUuid(ticketId)) return;
  await setTicketStatus(user, ticketId, "closed").catch((error) => opsFormState(error));
}
