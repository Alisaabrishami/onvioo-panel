import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import * as z from "zod";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { generateSessionToken, hashToken } from "@/lib/auth/tokens";

// Mobile API plumbing: bearer tokens (rows in the same sessions table as
// browser logins, so signing out everywhere covers both), JSON errors in
// Persian ready to show, and body validation.

export const TOKEN_DAYS = 90;

export type ApiUser = { id: string; name: string; phone: string; role: Role; clientId: string | null; tokenHash: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new ApiError(404, "not_found", "پیدا نشد");
export const forbidden = () => new ApiError(403, "forbidden", "این بخش برای حساب شما نیست");

export async function issueToken(userId: string, device: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + TOKEN_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt, device: device ?? "اپ موبایل" });
  return { token, expiresAt };
}

async function bearerUser(request: Request): Promise<ApiUser | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ id: schema.users.id, name: schema.users.name, phone: schema.users.phone, role: schema.users.role, clientId: schema.users.clientId })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, tokenHash), gt(schema.sessions.expiresAt, new Date()), eq(schema.users.active, true)))
    .limit(1);
  return row ? { ...row, tokenHash } : null;
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  console.error("[api]", error);
  return Response.json({ error: { code: "server_error", message: "خطای سرور؛ دوباره امتحان کنید" } }, { status: 500 });
}

type Handler<C> = (request: Request, ctx: C) => Promise<unknown>;
type UserHandler<C> = (user: ApiUser, request: Request, ctx: C) => Promise<unknown>;

// Wraps a route handler: JSON out, ApiError → its status, anything else → 500
export function open<C>(handler: Handler<C>) {
  return async (request: Request, ctx: C): Promise<Response> => {
    // Every API answer depends on the request, never prerendered
    await connection();
    try {
      const data = await handler(request, ctx);
      return data instanceof Response ? data : Response.json({ data });
    } catch (error) {
      unstable_rethrow(error);
      return errorResponse(error);
    }
  };
}

// Same, after checking the bearer token and, if given, the role
export function authed<C>(handler: UserHandler<C>, roles?: readonly Role[]) {
  return open<C>(async (request, ctx) => {
    const user = await bearerUser(request);
    if (!user) throw new ApiError(401, "unauthorized", "دوباره وارد شوید");
    if (roles && !roles.includes(user.role)) throw forbidden();
    return handler(user, request, ctx);
  });
}

export const TEAM = ["admin", "staff"] as const;
export const CLIENT = ["client"] as const;

export async function body<T extends z.ZodType>(request: Request, shape: T): Promise<z.infer<T>> {
  const json = await request.json().catch(() => null);
  const parsed = shape.safeParse(json ?? {});
  if (!parsed.success) throw new ApiError(422, "invalid", persianIssue(parsed.error.issues[0]));
  return parsed.data;
}

// Our schemas carry Persian messages; zod's built-in English ones (a missing
// or mistyped field) are replaced so the app can always show the message
function persianIssue(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return "ورودی معتبر نیست";
  if (!/^[A-Za-z]/.test(issue.message)) return issue.message;
  const field = issue.path.join(".") || "ورودی";
  return issue.code === "invalid_type" && issue.input === undefined ? `${field} لازم است` : `${field} معتبر نیست`;
}

export function query(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

// ?limit=&offset= with sane bounds
export function page(request: Request, max = 100): { limit: number; offset: number } {
  const q = query(request);
  const limit = Math.min(max, Math.max(1, Number(q.get("limit")) || 30));
  const offset = Math.max(0, Number(q.get("offset")) || 0);
  return { limit, offset };
}

export const uuid = z.uuid({ error: "شناسه معتبر نیست" });

export function idParam(value: string): string {
  if (!uuid.safeParse(value).success) throw notFound();
  return value;
}

// An optional ?name= that must be a uuid when present
export function uuidParam(request: Request, name: string): string | null {
  const value = query(request).get(name);
  if (!value) return null;
  if (!uuid.safeParse(value).success) throw new ApiError(422, "invalid", `${name} معتبر نیست`);
  return value;
}

// The client account behind a client login
export function clientOf(user: ApiUser): string {
  if (!user.clientId) throw forbidden();
  return user.clientId;
}
