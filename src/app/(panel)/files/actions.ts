"use server";

import { requireTeam } from "@/lib/auth/dal";
import { OpsError } from "@/lib/ops/errors";
import { type UploadInput, finishUpload, startUpload as start } from "@/lib/ops/uploads";

export type UploadTicket = { ok: true; uploadUrl: string; key: string } | { ok: false; error: string };

export async function startUpload(input: UploadInput): Promise<UploadTicket> {
  const user = await requireTeam();
  try {
    const { key, uploadUrl } = await start(user, input);
    return { ok: true, key, uploadUrl };
  } catch (error) {
    if (error instanceof OpsError) return { ok: false, error: error.message };
    throw error;
  }
}

// Called after the browser finished the PUT to storage
export async function completeUpload(input: UploadInput & { key: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireTeam();
  try {
    await finishUpload(user, input);
    return { ok: true };
  } catch (error) {
    if (error instanceof OpsError) return { ok: false, error: error.message };
    throw error;
  }
}
