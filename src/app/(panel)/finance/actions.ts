"use server";

import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import { type FormState, optionalText, optionalUuid, typedValues } from "@/lib/forms";
import { fromJalali, jalaliMonthDays, jalaliToIsoDate, toLatinDigits, toPersianDigits } from "@/lib/format";
import {
  CATEGORY_DIRECTION,
  autoMatch,
  dedupeKey,
  parseBankRows,
  suggestCategory,
  type BankLine,
  type BankMapping,
} from "@/lib/finance";
import type { FinanceCategory } from "@/db/schema";
import { accountLocked, transactionsBetween } from "@/lib/finance-data";
import { buildObjectKey, presignUpload, storageConfigured } from "@/lib/storage";
import { addDays, parseCount } from "@/lib/growth";
import { parsePeriod } from "@/lib/payroll";
import { MAX_TABLE_BYTES, readTableFile } from "@/lib/table-file";

function revalidateFinance() {
  revalidatePath("/finance", "layout");
}

const fieldErrors = (error: z.ZodError) => z.flattenError(error).fieldErrors as Record<string, string[]>;

const toman = z.string().transform((v, ctx) => {
  const n = parseCount(v);
  if (n == null || Number.isNaN(n)) {
    ctx.addIssue({ code: "custom", message: "مبلغ را به تومان و با عدد بنویسید" });
    return z.NEVER;
  }
  return n;
});
const optionalToman = z.string().transform((v, ctx) => {
  const n = parseCount(v);
  if (Number.isNaN(n)) {
    ctx.addIssue({ code: "custom", message: "عدد نامعتبر" });
    return z.NEVER;
  }
  return n ?? 0;
});
const isoDay = z.string().transform((v, ctx) => {
  const iso = jalaliToIsoDate(v);
  if (!iso) {
    ctx.addIssue({ code: "custom", message: "تاریخ را مثل ۱۴۰۵/۰۷/۲۷ بنویسید" });
    return z.NEVER;
  }
  return iso;
});

// --- Accounts ---------------------------------------------------------

const accountSchema = z.object({
  name: z.string().trim().min(2, { error: "نام حساب را بنویسید" }),
  kind: z.enum(schema.accountKindEnum.enumValues),
  openingBalance: optionalToman,
});

export async function createAccount(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = accountSchema.safeParse({
    name: formData.get("name") ?? "",
    kind: formData.get("kind") ?? "bank",
    openingBalance: formData.get("openingBalance") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: typedValues(formData) };
  const [a] = await db.insert(schema.financeAccounts).values(parsed.data).returning({ id: schema.financeAccounts.id });
  await audit(admin.id, "create", "finance_account", a.id, { name: parsed.data.name });
  revalidateFinance();
  return { ok: true, message: "حساب ساخته شد" };
}

export async function setOpeningBalance(accountId: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(accountId)) return { message: "پیدا نشد" };
  const parsed = optionalToman.safeParse(String(formData.get("openingBalance") ?? ""));
  if (!parsed.success) return { errors: { openingBalance: ["عدد نامعتبر"] } };
  await db.update(schema.financeAccounts).set({ openingBalance: parsed.data }).where(eq(schema.financeAccounts.id, accountId));
  await audit(admin.id, "update", "finance_account", accountId, { openingBalance: parsed.data });
  revalidateFinance();
  return { ok: true, message: "ذخیره شد" };
}

// --- Transactions -----------------------------------------------------

const txSchema = z.object({
  accountId: z.uuid({ error: "حساب را انتخاب کنید" }),
  day: isoDay,
  category: z.enum(schema.financeCategoryEnum.enumValues),
  amount: toman.refine((n) => n > 0, { error: "مبلغ باید بیشتر از صفر باشد" }),
  description: optionalText,
  reference: optionalText,
  clientId: optionalUuid,
  partnerId: optionalUuid,
});

export async function addTransaction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = typedValues(formData);
  const parsed = txSchema.safeParse({
    accountId: values.accountId ?? "",
    day: values.day ?? "",
    category: values.category ?? "other_expense",
    amount: values.amount ?? "",
    description: values.description ?? "",
    reference: values.reference ?? "",
    clientId: values.clientId ?? "",
    partnerId: values.partnerId ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const d = parsed.data;
  if (d.category.startsWith("partner_") && !d.partnerId) return { errors: { partnerId: ["شریک را انتخاب کنید"] }, values };
  if (await accountLocked(d.accountId, d.day)) return { errors: { day: ["این تاریخ در دوره قفل‌شده حساب است"] }, values };
  const [t] = await db
    .insert(schema.transactions)
    .values({
      ...d,
      direction: CATEGORY_DIRECTION[d.category],
      clientId: d.category === "client_payment" ? d.clientId : null,
      partnerId: d.category.startsWith("partner_") ? d.partnerId : null,
      createdBy: admin.id,
    })
    .returning({ id: schema.transactions.id });
  await audit(admin.id, "create", "transaction", t.id, { amount: d.amount, category: d.category });
  revalidateFinance();
  return { ok: true, message: "ثبت شد", values: { accountId: d.accountId, category: d.category } };
}

export async function deleteTransaction(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  const [t] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, id));
  if (!t || (await accountLocked(t.accountId, t.day))) return;
  await db.transaction(async (tx) => {
    // A deleted salary payment puts its payslip back to draft
    if (t.payslipId) await tx.update(schema.payslips).set({ status: "draft", paidAt: null }).where(eq(schema.payslips.id, t.payslipId));
    await tx.delete(schema.transactions).where(eq(schema.transactions.id, id));
  });
  await audit(admin.id, "delete", "transaction", id, { amount: t.amount, category: t.category });
  revalidateFinance();
  revalidatePath("/payroll");
}

// --- Receipts ---------------------------------------------------------

const receiptSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(20 * 1024 * 1024),
  mime: z.string().regex(/^(image\/|application\/pdf$)/),
});

export type ReceiptTicket = { ok: true; uploadUrl: string; key: string } | { ok: false; error: string };

// A photo or PDF of the receipt goes straight from the browser to storage
export async function startReceiptUpload(transactionId: string, input: z.input<typeof receiptSchema>): Promise<ReceiptTicket> {
  await requireAdmin();
  if (!storageConfigured()) return { ok: false, error: "فضای ذخیره‌سازی تنظیم نشده است" };
  if (!isUuid(transactionId)) return { ok: false, error: "تراکنش پیدا نشد" };
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "فقط عکس یا PDF تا ۲۰ مگابایت" };
  const key = buildObjectKey(parsed.data.name, "receipts");
  return { ok: true, key, uploadUrl: await presignUpload(key, parsed.data.mime) };
}

export async function attachReceipt(transactionId: string, input: z.input<typeof receiptSchema> & { key: string }): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  const parsed = receiptSchema.extend({ key: z.string().startsWith("receipts/") }).safeParse(input);
  if (!isUuid(transactionId) || !parsed.success) return { ok: false };
  const [t] = await db.select({ id: schema.transactions.id }).from(schema.transactions).where(eq(schema.transactions.id, transactionId));
  if (!t) return { ok: false };
  const [file] = await db
    .insert(schema.files)
    .values({ ...parsed.data, kind: "other", uploadedBy: admin.id })
    .returning({ id: schema.files.id });
  await db.update(schema.transactions).set({ receiptFileId: file.id }).where(eq(schema.transactions.id, transactionId));
  await audit(admin.id, "attach_receipt", "transaction", transactionId);
  revalidateFinance();
  return { ok: true };
}

export async function removeReceipt(transactionId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(transactionId)) return;
  await db.update(schema.transactions).set({ receiptFileId: null }).where(eq(schema.transactions.id, transactionId));
  await audit(admin.id, "remove_receipt", "transaction", transactionId);
  revalidateFinance();
}

// --- Partners ---------------------------------------------------------

const partnerSchema = z.object({
  name: z.string().trim().min(2, { error: "نام شریک را بنویسید" }),
  share: z.string().transform((v, ctx) => {
    const pct = Number(toLatinDigits(v).replace(/[%٪\s]/g, "").replace("٫", "."));
    if (!v.trim() || !Number.isFinite(pct) || pct < 0 || pct > 100) {
      ctx.addIssue({ code: "custom", message: "درصد سهم بین ۰ تا ۱۰۰" });
      return z.NEVER;
    }
    return Math.round(pct * 100);
  }),
  openingBalance: optionalToman,
});

export async function createPartner(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = partnerSchema.safeParse({
    name: formData.get("name") ?? "",
    share: formData.get("share") ?? "",
    openingBalance: formData.get("openingBalance") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: typedValues(formData) };
  const [p] = await db
    .insert(schema.partners)
    .values({ name: parsed.data.name, shareBp: parsed.data.share, openingBalance: parsed.data.openingBalance })
    .returning({ id: schema.partners.id });
  await audit(admin.id, "create", "partner", p.id);
  revalidateFinance();
  return { ok: true, message: "شریک اضافه شد" };
}

// --- Recurring expenses -------------------------------------------------

const recurringSchema = z.object({
  title: z.string().trim().min(2, { error: "عنوان را بنویسید" }),
  category: z.enum(schema.financeCategoryEnum.enumValues),
  amount: toman.refine((n) => n > 0, { error: "مبلغ باید بیشتر از صفر باشد" }),
  accountId: optionalUuid,
  dueDay: z.coerce.number().int().min(1, { error: "روز ۱ تا ۳۱" }).max(31, { error: "روز ۱ تا ۳۱" }),
});

export async function createRecurring(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const values = typedValues(formData);
  const parsed = recurringSchema.safeParse({
    title: values.title ?? "",
    category: values.category ?? "rent",
    amount: values.amount ?? "",
    accountId: values.accountId ?? "",
    dueDay: toLatinDigits(values.dueDay ?? "1"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const [r] = await db.insert(schema.recurringExpenses).values(parsed.data).returning({ id: schema.recurringExpenses.id });
  await audit(admin.id, "create", "recurring_expense", r.id);
  revalidateFinance();
  return { ok: true, message: "اضافه شد" };
}

export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return;
  await db.update(schema.recurringExpenses).set({ active }).where(eq(schema.recurringExpenses.id, id));
  await audit(admin.id, active ? "activate" : "deactivate", "recurring_expense", id);
  revalidateFinance();
}

// Records this month's payment of a recurring cost on its due day
export async function payRecurring(id: string, period: string): Promise<FormState> {
  const admin = await requireAdmin();
  const p = parsePeriod(period);
  if (!isUuid(id) || !p) return { message: "پیدا نشد" };
  const [r] = await db.select().from(schema.recurringExpenses).where(eq(schema.recurringExpenses.id, id));
  if (!r?.accountId) return { message: "برای این هزینه حساب انتخاب نشده" };
  const due = fromJalali(p.jy, p.jm, Math.min(r.dueDay, jalaliMonthDays(p.jy, p.jm)), 12);
  const day = due.toISOString().slice(0, 10);
  const start = jalaliToIsoDate(`${p.jy}/${p.jm}/1`)!;
  const end = addDays(start, jalaliMonthDays(p.jy, p.jm));
  const [already] = await db
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.recurringId, id), gte(schema.transactions.day, start), lt(schema.transactions.day, end)));
  if (already) return { message: "قبلاً ثبت شده" };
  if (await accountLocked(r.accountId, day)) return { message: "این ماه در حساب قفل شده" };
  await db.insert(schema.transactions).values({
    accountId: r.accountId,
    day,
    direction: CATEGORY_DIRECTION[r.category],
    amount: r.amount,
    category: r.category,
    description: r.title,
    recurringId: r.id,
    createdBy: admin.id,
  });
  await audit(admin.id, "pay", "recurring_expense", id, { period });
  revalidateFinance();
  return { ok: true, message: "ثبت شد" };
}

// --- Uploads shared by bank statements and past-data import -------------

async function stageUpload(kind: "bank_statement" | "transactions", accountId: string | null, formData: FormData, userId: string) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "فایل را انتخاب کنید" } as const;
  if (file.size > MAX_TABLE_BYTES) return { error: "فایل بزرگ‌تر از ۵ مگابایت است" } as const;
  let rows: string[][];
  try {
    rows = await readTableFile(file);
  } catch (error) {
    return { error: error instanceof Error && error.message === "xls" ? "فایل xls قدیمی است؛ در اکسل با فرمت xlsx یا CSV ذخیره کنید." : "فایل خوانده نشد؛ xlsx یا CSV بدهید." } as const;
  }
  // Statements often start with a few title lines; the header is the first row with three or more filled cells
  const headerAt = rows.findIndex((r) => r.filter((c) => c.trim()).length >= 3);
  if (headerAt < 0 || rows.length - headerAt < 2) return { error: "در فایل جدولی با سطر عنوان پیدا نشد" } as const;
  const [batch] = await db
    .insert(schema.importBatches)
    .values({ kind, accountId, fileName: file.name, pending: rows.slice(headerAt), createdBy: userId })
    .returning({ id: schema.importBatches.id });
  return { batchId: batch.id } as const;
}

async function pendingBatch(batchId: string, kind: "bank_statement" | "transactions") {
  if (!isUuid(batchId)) return null;
  const [b] = await db
    .select()
    .from(schema.importBatches)
    .where(and(eq(schema.importBatches.id, batchId), eq(schema.importBatches.kind, kind), isNull(schema.importBatches.confirmedAt)));
  return b?.pending ? b : null;
}

function readMapping(formData: FormData): BankMapping | null {
  const col = (k: string) => {
    const v = String(formData.get(k) ?? "");
    return v === "" ? undefined : Number(v);
  };
  const m: BankMapping = {
    date: col("date") ?? -1,
    description: col("description"),
    reference: col("reference"),
    balance: col("balance"),
    amount: formData.get("amountMode") === "single" ? col("amount") : undefined,
    debit: formData.get("amountMode") === "single" ? undefined : col("debit"),
    credit: formData.get("amountMode") === "single" ? undefined : col("credit"),
    rial: formData.get("rial") === "on",
  };
  if (m.date < 0) return null;
  if (m.amount === undefined && m.debit === undefined && m.credit === undefined) return null;
  return m;
}

// --- Bank reconciliation ------------------------------------------------

export async function uploadStatement(accountId: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(accountId)) return { message: "حساب پیدا نشد" };
  const staged = await stageUpload("bank_statement", accountId, formData, admin.id);
  if ("error" in staged) return { errors: { file: [staged.error!] } };
  redirect(`/finance/accounts/${accountId}?batch=${staged.batchId}`);
}

export async function confirmStatement(accountId: string, batchId: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const batch = await pendingBatch(batchId, "bank_statement");
  if (!batch || batch.accountId !== accountId) return { message: "این فایل قبلاً ثبت شده یا پیدا نشد" };
  const mapping = readMapping(formData);
  if (!mapping) return { message: "ستون تاریخ و مبلغ (یا برداشت/واریز) را مشخص کنید", values: typedValues(formData) };
  const { lines, problems } = parseBankRows(batch.pending!.slice(1), mapping);
  if (lines.length === 0) return { message: `هیچ سطری خوانده نشد. ${problems.slice(0, 3).join("، ")}`, values: typedValues(formData) };

  // Two identical lines in one statement are both real; number repeats so only overlaps across files are skipped
  const seen = new Map<string, number>();
  const values = lines.map((l) => {
    const base = dedupeKey(l);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { accountId, importBatchId: batch.id, ...l, dedupeKey: `${base}#${n}` };
  });
  const inserted = await db.insert(schema.bankLines).values(values).onConflictDoNothing().returning({ id: schema.bankLines.id });
  await db
    .update(schema.importBatches)
    .set({ pending: null, confirmedAt: new Date(), rows: inserted.length })
    .where(eq(schema.importBatches.id, batch.id));
  await db.update(schema.financeAccounts).set({ importMapping: mapping }).where(eq(schema.financeAccounts.id, accountId));
  const matched = await matchAccount(accountId);
  await audit(admin.id, "import", "bank_statement", batch.id, { rows: inserted.length, skipped: lines.length - inserted.length });
  revalidateFinance();
  redirect(
    `/finance/accounts/${accountId}?imported=${inserted.length}&skipped=${lines.length - inserted.length}&matched=${matched}&problems=${problems.length}`,
  );
}

async function matchAccount(accountId: string): Promise<number> {
  const lines = await db
    .select()
    .from(schema.bankLines)
    .where(and(eq(schema.bankLines.accountId, accountId), isNull(schema.bankLines.transactionId)));
  if (lines.length === 0) return 0;
  const days = lines.map((l) => l.day).sort();
  const txs = await transactionsBetween(addDays(days[0], -7), addDays(days[days.length - 1], 8), accountId);
  const taken = new Set(
    (await db.select({ id: schema.bankLines.transactionId }).from(schema.bankLines).where(eq(schema.bankLines.accountId, accountId)))
      .map((r) => r.id)
      .filter(Boolean),
  );
  const free = txs.filter((t) => !taken.has(t.id));
  const pairs = autoMatch(lines, free);
  for (const [lineId, txId] of pairs) {
    await db.update(schema.bankLines).set({ transactionId: txId }).where(eq(schema.bankLines.id, lineId));
  }
  return pairs.size;
}

export async function runAutoMatch(accountId: string): Promise<FormState> {
  await requireAdmin();
  if (!isUuid(accountId)) return { message: "پیدا نشد" };
  const n = await matchAccount(accountId);
  revalidateFinance();
  return { ok: true, message: n ? `${toPersianDigits(n)} مورد تطبیق داده شد` : "مورد تازه‌ای برای تطبیق پیدا نشد" };
}

export async function matchLine(lineId: string, transactionId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(lineId) || !isUuid(transactionId)) return;
  await db.update(schema.bankLines).set({ transactionId }).where(and(eq(schema.bankLines.id, lineId), isNull(schema.bankLines.transactionId)));
  await audit(admin.id, "match", "bank_line", lineId, { transactionId });
  revalidateFinance();
}

export async function unmatchLine(lineId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(lineId)) return;
  const [line] = await db.select().from(schema.bankLines).where(eq(schema.bankLines.id, lineId));
  if (!line || (await accountLocked(line.accountId, line.day))) return;
  await db.update(schema.bankLines).set({ transactionId: null }).where(eq(schema.bankLines.id, lineId));
  await audit(admin.id, "unmatch", "bank_line", lineId);
  revalidateFinance();
}

// A bank line that isn't in the panel yet becomes a transaction in one step
export async function recordLine(lineId: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(lineId)) return { message: "پیدا نشد" };
  const [line] = await db.select().from(schema.bankLines).where(and(eq(schema.bankLines.id, lineId), isNull(schema.bankLines.transactionId)));
  if (!line) return { message: "این سطر قبلاً ثبت شده است" };
  const category = z.enum(schema.financeCategoryEnum.enumValues).safeParse(formData.get("category"));
  if (!category.success) return { message: "دسته را انتخاب کنید" };
  const direction = line.amount > 0 ? "in" : "out";
  if (CATEGORY_DIRECTION[category.data] !== direction) return { message: direction === "in" ? "این سطر واریز است؛ دسته درآمد یا آورده انتخاب کنید" : "این سطر برداشت است؛ دسته هزینه یا برداشت انتخاب کنید" };
  const clientId = formData.get("clientId");
  const partnerId = formData.get("partnerId");
  if (category.data.startsWith("partner_") && !isUuid(partnerId)) return { message: "شریک را انتخاب کنید" };
  await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(schema.transactions)
      .values({
        accountId: line.accountId,
        day: line.day,
        direction,
        amount: Math.abs(line.amount),
        category: category.data,
        description: line.description,
        reference: line.reference,
        clientId: category.data === "client_payment" && isUuid(clientId) ? clientId : null,
        partnerId: category.data.startsWith("partner_") && isUuid(partnerId) ? partnerId : null,
        createdBy: admin.id,
      })
      .returning({ id: schema.transactions.id });
    await tx.update(schema.bankLines).set({ transactionId: t.id }).where(eq(schema.bankLines.id, line.id));
  });
  await audit(admin.id, "record", "bank_line", lineId, { category: category.data });
  revalidateFinance();
  return { ok: true };
}

export async function lockAccount(accountId: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(accountId)) return { message: "پیدا نشد" };
  const day = jalaliToIsoDate(String(formData.get("day") ?? ""));
  if (!day) return { errors: { day: ["تاریخ را وارد کنید"] } };
  await db.update(schema.financeAccounts).set({ lockedThrough: day }).where(eq(schema.financeAccounts.id, accountId));
  await audit(admin.id, "lock", "finance_account", accountId, { through: day });
  revalidateFinance();
  return { ok: true, message: "دوره تأیید و قفل شد" };
}

// Undo a whole import: its statement lines, or the transactions it created
export async function undoBatch(batchId: string): Promise<void> {
  const admin = await requireAdmin();
  if (!isUuid(batchId)) return;
  const [b] = await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, batchId));
  if (!b) return;
  if (b.kind === "transactions") {
    const txs = await db.select({ id: schema.transactions.id, accountId: schema.transactions.accountId, day: schema.transactions.day }).from(schema.transactions).where(eq(schema.transactions.importBatchId, batchId));
    for (const t of txs) if (await accountLocked(t.accountId, t.day)) return;
    if (txs.length) await db.update(schema.bankLines).set({ transactionId: null }).where(inArray(schema.bankLines.transactionId, txs.map((t) => t.id)));
  }
  await db.delete(schema.importBatches).where(eq(schema.importBatches.id, batchId));
  await audit(admin.id, "undo", "import_batch", batchId, { kind: b.kind, rows: b.rows });
  revalidateFinance();
}

// --- Past data (Parmis or any spreadsheet) --------------------------------

export async function uploadLedger(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const staged = await stageUpload("transactions", null, formData, admin.id);
  if ("error" in staged) return { errors: { file: [staged.error!] } };
  redirect(`/finance/import?batch=${staged.batchId}`);
}

export type LedgerPreview = FormState & { preview?: { day: string; amount: number; category: string; description: string }[]; problems?: string[]; total?: number };

export async function confirmLedger(batchId: string, _: LedgerPreview, formData: FormData): Promise<LedgerPreview> {
  const admin = await requireAdmin();
  const batch = await pendingBatch(batchId, "transactions");
  if (!batch) return { message: "این فایل قبلاً ثبت شده یا پیدا نشد" };
  const accountId = String(formData.get("accountId") ?? "");
  if (!isUuid(accountId)) return { message: "حساب را انتخاب کنید" };
  const mapping = readMapping(formData);
  if (!mapping) return { message: "ستون تاریخ و مبلغ (یا بدهکار/بستانکار) را مشخص کنید" };
  const catCol = String(formData.get("categoryCol") ?? "");
  const body = batch.pending!.slice(1);
  // Parse row by row so each line keeps its own category text
  const problems: string[] = [];
  const rows: (BankLine & { category: FinanceCategory })[] = [];
  body.forEach((r, i) => {
    const parsed = parseBankRows([r], mapping);
    const l = parsed.lines[0];
    if (!l) {
      problems.push(...parsed.problems.map((p) => p.replace(/سطر \d+/, `سطر ${i + 2}`)));
      return;
    }
    const catText = catCol !== "" ? (r[Number(catCol)] ?? "") : "";
    let category = suggestCategory(`${catText} ${l.description}`, l.amount);
    if (CATEGORY_DIRECTION[category] !== (l.amount > 0 ? "in" : "out")) category = l.amount > 0 ? "other_income" : "other_expense";
    rows.push({ ...l, category });
  });

  const preview = {
    preview: rows.slice(0, 15).map((r) => ({ day: r.day, amount: r.amount, category: r.category, description: r.description })),
    problems: problems.slice(0, 10),
    total: rows.length,
    values: typedValues(formData),
  };
  if (formData.get("intent") !== "commit") return preview;
  let locked = 0;
  for (const r of rows) if (await accountLocked(accountId, r.day)) locked++;
  if (locked) return { ...preview, message: `${toPersianDigits(locked)} سطر در دوره قفل‌شده این حساب است` };
  if (rows.length) {
    await db.insert(schema.transactions).values(
      rows.map((r) => ({
        accountId,
        day: r.day,
        direction: r.amount > 0 ? ("in" as const) : ("out" as const),
        amount: Math.abs(r.amount),
        category: r.category,
        description: r.description || null,
        reference: r.reference,
        importBatchId: batch.id,
        createdBy: admin.id,
      })),
    );
  }
  await db.update(schema.importBatches).set({ pending: null, confirmedAt: new Date(), rows: rows.length, accountId }).where(eq(schema.importBatches.id, batch.id));
  await audit(admin.id, "import", "transactions", batch.id, { rows: rows.length });
  revalidateFinance();
  redirect(`/finance/import?done=${rows.length}`);
}

export async function discardBatch(batchId: string, back: string): Promise<void> {
  await requireAdmin();
  if (isUuid(batchId)) await db.delete(schema.importBatches).where(and(eq(schema.importBatches.id, batchId), isNull(schema.importBatches.confirmedAt)));
  redirect(back.startsWith("/finance") ? back : "/finance");
}

