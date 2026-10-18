import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import { canAccess, homeFor } from "./roles";
import { readSessionUser, type SessionUser } from "./session";

// One session lookup per request, however many components ask
export const getCurrentUser = cache(readSessionUser);

// For pages and server actions: sends signed-out users to login and
// users with the wrong role to their own home
export async function requireUser(allowed?: readonly Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (allowed && !canAccess(user.role, allowed)) redirect(homeFor(user.role));
  return user;
}

export const requireTeam = () => requireUser(["admin", "staff"]);
export const requireAdmin = () => requireUser(["admin"]);
