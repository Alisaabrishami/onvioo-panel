import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requestOtp, verifyOtp } from "@/lib/auth/otp";
import { contractHash } from "@/lib/contract-hash";
import { toLatinDigits } from "@/lib/format";
import { notifyClient, notifyTeam } from "@/lib/notify";
import { type Actor, OpsError, conflict, fieldError, missing, parseInput } from "./errors";

// Digital contracts: the admin drafts and sends, the client signs with an SMS
// code. Shared by the panel, the portal and the mobile API.

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "تاریخ را به‌صورت YYYY-MM-DD بفرستید" })
  .nullable()
  .optional();

export const contractInput = z
  .object({
    clientId: z.uuid({ error: "مشتری را انتخاب کنید" }),
    title: z.string().trim().min(3, { error: "عنوان قرارداد را بنویسید" }).max(300),
    body: z.string().trim().min(20, { error: "متن قرارداد خیلی کوتاه است" }),
    amount: z.number({ error: "مبلغ را فقط با عدد بنویسید" }).int().nonnegative({ error: "مبلغ معتبر نیست" }).nullable().optional(),
    startsOn: isoDay,
    endsOn: isoDay,
  })
  .refine((c) => !c.startsOn || !c.endsOn || c.startsOn <= c.endsOn, { path: ["endsOn"], error: "پایان قرارداد قبل از شروع آن است" });
export type ContractInput = z.input<typeof contractInput>;

function adminOnly(actor: Actor) {
  if (actor.role !== "admin") throw new OpsError("forbidden", "قراردادها فقط برای مدیر است", 403);
}

function revalidateContracts(id?: string) {
  revalidatePath("/contracts");
  revalidatePath("/portal/contracts");
  if (id) {
    revalidatePath(`/contracts/${id}`);
    revalidatePath(`/portal/contracts/${id}`);
  }
}

async function checkClient(clientId: string) {
  const [client] = await db.select({ id: schema.clients.id }).from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw fieldError("clientId", "مشتری پیدا نشد");
}

function values(input: z.infer<typeof contractInput>) {
  return { clientId: input.clientId, title: input.title, body: input.body, amount: input.amount ?? null, startsOn: input.startsOn ?? null, endsOn: input.endsOn ?? null };
}

// A contract the caller may see: any for the admin, a client's own once sent
export async function visibleContract(actor: Actor, id: string) {
  if (actor.role === "staff") throw new OpsError("forbidden", "قراردادها فقط برای مدیر است", 403);
  const [contract] = await db
    .select()
    .from(schema.contracts)
    .where(
      and(
        eq(schema.contracts.id, id),
        actor.role === "client" ? and(eq(schema.contracts.clientId, actor.clientId ?? ""), inArray(schema.contracts.status, ["sent", "signed"])) : undefined,
      ),
    );
  if (!contract) throw missing("قرارداد پیدا نشد");
  return contract;
}

export async function createContract(actor: Actor, raw: unknown) {
  adminOnly(actor);
  const input = parseInput(contractInput, raw);
  await checkClient(input.clientId);
  const [contract] = await db.insert(schema.contracts).values({ ...values(input), createdBy: actor.id }).returning();
  await audit(actor.id, "create", "contract", contract.id, { title: input.title });
  revalidateContracts();
  return contract;
}

// Only drafts change; a sent contract is withdrawn to draft first
export async function updateContract(actor: Actor, id: string, raw: unknown) {
  adminOnly(actor);
  const input = parseInput(contractInput, raw);
  await checkClient(input.clientId);
  const [updated] = await db
    .update(schema.contracts)
    .set(values(input))
    .where(and(eq(schema.contracts.id, id), eq(schema.contracts.status, "draft")))
    .returning();
  if (!updated) {
    await visibleContract(actor, id);
    throw conflict("فقط پیش‌نویس قابل ویرایش است");
  }
  await audit(actor.id, "update", "contract", id);
  revalidateContracts(id);
  return updated;
}

export async function sendContract(actor: Actor, id: string) {
  adminOnly(actor);
  const [contract] = await db
    .update(schema.contracts)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(schema.contracts.id, id), eq(schema.contracts.status, "draft")))
    .returning();
  if (!contract) {
    await visibleContract(actor, id);
    throw conflict("فقط پیش‌نویس ارسال می‌شود");
  }
  await audit(actor.id, "send", "contract", id);
  await notifyClient(contract.clientId, { title: `قرارداد «${contract.title}» برای امضای شما ارسال شد`, href: `/portal/contracts/${contract.id}` }, { sms: true });
  revalidateContracts(id);
  return contract;
}

// Pulls a sent contract back for edits, or cancels a draft or sent one
export async function withdrawContract(actor: Actor, id: string, to: "draft" | "cancelled") {
  adminOnly(actor);
  if (to !== "draft" && to !== "cancelled") throw fieldError("to", "مقصد باید draft یا cancelled باشد");
  const from: ("draft" | "sent")[] = to === "draft" ? ["sent"] : ["draft", "sent"];
  const [updated] = await db
    .update(schema.contracts)
    .set({ status: to, sentAt: to === "draft" ? null : undefined })
    .where(and(eq(schema.contracts.id, id), inArray(schema.contracts.status, from)))
    .returning();
  if (!updated) {
    await visibleContract(actor, id);
    throw conflict(to === "draft" ? "فقط قرارداد ارسال‌شده برگردانده می‌شود" : "قرارداد امضاشده لغو نمی‌شود");
  }
  await audit(actor.id, to === "draft" ? "withdraw" : "cancel", "contract", id);
  revalidateContracts(id);
  return updated;
}

// Signed contracts are records and are never deleted
export async function deleteContract(actor: Actor, id: string) {
  adminOnly(actor);
  const deleted = await db
    .delete(schema.contracts)
    .where(and(eq(schema.contracts.id, id), eq(schema.contracts.status, "draft")))
    .returning({ id: schema.contracts.id });
  if (deleted.length === 0) {
    await visibleContract(actor, id);
    throw conflict("فقط پیش‌نویس حذف می‌شود");
  }
  await audit(actor.id, "delete", "contract", id);
  revalidateContracts();
}

async function awaitingSignature(actor: Actor, id: string) {
  if (actor.role !== "client" || !actor.clientId) throw new OpsError("forbidden", "امضا فقط با حساب مشتری است", 403);
  const [contract] = await db
    .select()
    .from(schema.contracts)
    .where(and(eq(schema.contracts.id, id), eq(schema.contracts.clientId, actor.clientId), eq(schema.contracts.status, "sent")));
  if (!contract) throw conflict("این قرارداد دیگر منتظر امضا نیست");
  return contract;
}

export async function sendSignCode(actor: Actor & { phone: string }, id: string) {
  await awaitingSignature(actor, id);
  let res;
  try {
    res = await requestOtp(actor.phone);
  } catch {
    throw new OpsError("sms_failed", "ارسال پیامک ممکن نشد؛ کمی بعد دوباره امتحان کنید", 502);
  }
  if (!res.ok) {
    throw new OpsError(res.error, res.error === "too_soon" ? "یک دقیقه صبر کنید و دوباره کد بگیرید" : "تعداد درخواست کد زیاد بود؛ یک ساعت دیگر امتحان کنید", 429);
  }
}

export const signInput = z.object({
  agree: z.literal(true, { error: "برای امضا باید متن را بپذیرید" }),
  signerName: z.string().trim().min(3, { error: "نام و نام خانوادگی خود را بنویسید" }).max(120),
  code: z.string().transform((v) => toLatinDigits(v).trim()).pipe(z.string().regex(/^\d{6}$/, { error: "کد ۶ رقمی پیامک را وارد کنید" })),
});

// The evidence kept with a signature: who, from where, and a hash of exactly
// the text they agreed to
export async function signContract(actor: Actor & { phone: string }, id: string, raw: unknown, origin: { ip: string | null; agent: string | null }) {
  const input = parseInput(signInput, raw);
  const contract = await awaitingSignature(actor, id);
  if (!(await verifyOtp(actor.phone, input.code))) throw fieldError("code", "کد اشتباه است یا منقضی شده");
  const [signed] = await db
    .update(schema.contracts)
    .set({
      status: "signed",
      signedAt: new Date(),
      signedBy: actor.id,
      signerName: input.signerName,
      signerPhone: actor.phone,
      signerIp: origin.ip,
      signerAgent: origin.agent?.slice(0, 500) ?? null,
      bodyHash: contractHash(contract),
    })
    // The status check makes a double submit sign only once
    .where(and(eq(schema.contracts.id, contract.id), eq(schema.contracts.status, "sent")))
    .returning();
  if (!signed) throw conflict("این قرارداد دیگر منتظر امضا نیست");
  await audit(actor.id, "sign", "contract", contract.id, { ip: origin.ip });
  await notifyTeam({ title: `قرارداد «${contract.title}» امضا شد`, body: `امضاکننده: ${input.signerName}`, href: `/contracts/${contract.id}` });
  revalidateContracts(contract.id);
  return signed;
}
