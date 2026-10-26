import type * as z from "zod";
import type { Role } from "@/db/schema";

// The signed-in person behind an action, from a browser session or an app token
export type Actor = { id: string; name: string; role: Role; clientId: string | null };

// A refusal with Persian text ready to show. Server actions turn it into form
// errors; the mobile API turns it into { error } with `status`.
export class OpsError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
    // The form field the message belongs to, when there is one
    public field?: string,
  ) {
    super(message);
  }
}

export const missing = (what = "پیدا نشد") => new OpsError("not_found", what, 404);
export const conflict = (message: string) => new OpsError("conflict", message, 409);
export const fieldError = (field: string, message: string) => new OpsError("invalid", message, 422, field);

// For server actions: an OpsError becomes the form state the page shows
export function opsFormState(error: unknown, values?: Record<string, string>) {
  if (!(error instanceof OpsError)) throw error;
  return error.field ? { errors: { [error.field]: [error.message] }, values } : { message: error.message, values };
}

// Our schemas carry Persian messages; zod's built-in English ones (a missing
// or mistyped field) are replaced so the message can always be shown
export function persianIssue(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return "ورودی معتبر نیست";
  if (!/^[A-Za-z]/.test(issue.message)) return issue.message;
  const field = issue.path.join(".") || "ورودی";
  // zod leaves the input out of issues, so a missing field is told apart by its message
  const absent = issue.code === "invalid_type" && /received undefined/.test(issue.message);
  return absent ? `${field} لازم است` : `${field} معتبر نیست`;
}

export function parseInput<T extends z.ZodType>(shape: T, raw: unknown): z.infer<T> {
  const parsed = shape.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new OpsError("invalid", persianIssue(issue), 422, issue?.path[0] != null ? String(issue.path[0]) : undefined);
}
