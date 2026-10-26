"use server";

import { requireUser } from "@/lib/auth/dal";
import { OpsError } from "@/lib/ops/errors";
import { finishUpload, startUpload } from "@/lib/ops/uploads";

// Attachments for ticket messages, from the panel and the portal. The file is
// uploaded straight to storage, registered here, then claimed by the message.

type Meta = { name: string; size: number; mime: string; clientId?: string | null };

export type AttachmentStart = { ok: true; key: string; uploadUrl: string } | { ok: false; error: string };
export type AttachmentDone = { ok: true; id: string } | { ok: false; error: string };

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof OpsError) return { ok: false, error: error.message };
  throw error;
}

export async function startAttachment(meta: Meta): Promise<AttachmentStart> {
  const user = await requireUser();
  try {
    const { key, uploadUrl } = await startUpload(user, { ...meta, kind: "other" });
    return { ok: true, key, uploadUrl };
  } catch (error) {
    return failure(error);
  }
}

export async function finishAttachment(meta: Meta & { key: string }): Promise<AttachmentDone> {
  const user = await requireUser();
  try {
    const file = await finishUpload(user, { ...meta, kind: "other" });
    return { ok: true, id: file.id };
  } catch (error) {
    return failure(error);
  }
}
