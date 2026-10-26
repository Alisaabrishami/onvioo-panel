"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { currentSessionHash } from "@/lib/auth/session";
import { revokeOtherSessions, revokeSession, sessionRef } from "@/lib/ops/sessions";

function revalidate() {
  revalidatePath("/account");
  revalidatePath("/portal/account");
}

export async function signOutDevice(ref: string): Promise<void> {
  const user = await requireUser();
  const current = await currentSessionHash();
  // This browser signs out through the normal logout button
  if (current && sessionRef(current) === ref) return;
  await revokeSession(user.id, ref).catch(() => undefined);
  revalidate();
}

export async function signOutOthers(): Promise<void> {
  const user = await requireUser();
  await revokeOtherSessions(user.id, await currentSessionHash());
  revalidate();
}

// Admin: cut off an app anyone on the team or a client signed in with
export async function revokeApp(userId: string, ref: string): Promise<void> {
  const admin = await requireAdmin();
  await revokeSession(userId, ref).catch(() => undefined);
  await audit(admin.id, "revoke_app", "session", ref, { userId });
  revalidatePath("/developers");
}
