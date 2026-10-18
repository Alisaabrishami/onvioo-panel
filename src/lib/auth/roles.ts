import type { Role } from "@/db/schema";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدیر",
  staff: "کارمند",
  client: "مشتری",
};

// Where each role lands after signing in
export function homeFor(role: Role): string {
  return role === "client" ? "/portal" : "/dashboard";
}

export function canAccess(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}
