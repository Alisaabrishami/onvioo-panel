"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, schema } from "@/db";
import { AiUnavailableError } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { requireAdmin, requireTeam } from "@/lib/auth/dal";
import { isUuid } from "@/lib/data";
import type { FormState } from "@/lib/forms";
import { toPersianDigits } from "@/lib/format";
import { mapHeader, parseCount, parseCsv, parseDateTime, parseDay, parseType } from "@/lib/growth";
import { explainSpike, scoreContent, trendIdeas, weeklyReport, type TrendIdeas } from "@/lib/growth-ai";
import { detectSpikes, syncAccount, upsertDay, upsertPosts } from "@/lib/growth-data";
import { normalizeUsername } from "@/lib/instagram";
import { notifyClient } from "@/lib/notify";
import { canEncrypt, seal } from "@/lib/secret-box";

function revalidateGrowth(clientId: string) {
  revalidatePath("/growth");
  revalidatePath(`/growth/${clientId}`);
  revalidatePath("/portal/growth");
}

function aiFailed(error: unknown): FormState {
  if (error instanceof AiUnavailableError) return { message: "هوش مصنوعی هنوز تنظیم نشده است (کلید Claude در تنظیمات سرور)." };
  console.error("[growth] AI request failed", error);
  return { message: "جواب هوش مصنوعی نیامد. چند لحظه بعد دوباره امتحان کنید." };
}

async function accountOfClient(clientId: string, accountId: string) {
  if (!isUuid(clientId) || !isUuid(accountId)) return null;
  const [account] = await db
    .select()
    .from(schema.igAccounts)
    .where(and(eq(schema.igAccounts.id, accountId), eq(schema.igAccounts.clientId, clientId)));
  return account ?? null;
}

export async function addAccount(clientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const values = { username: String(formData.get("username") ?? ""), kind: String(formData.get("kind") ?? "competitor") };
  const username = normalizeUsername(values.username);
  const kind = z.enum(schema.igAccountKindEnum.enumValues).safeParse(values.kind);
  if (!isUuid(clientId) || !kind.success) return { message: "درخواست نامعتبر", values };
  if (!username) return { errors: { username: ["نام کاربری اینستاگرام را درست بنویسید، مثل cafe.sample"] }, values };

  const inserted = await db
    .insert(schema.igAccounts)
    .values({ clientId, username, kind: kind.data })
    .onConflictDoNothing()
    .returning({ id: schema.igAccounts.id });
  if (inserted.length === 0) return { errors: { username: ["این پیج قبلاً اضافه شده است"] }, values };
  await audit(user.id, "create", "ig_account", inserted[0].id, { username, kind: kind.data });
  revalidateGrowth(clientId);
  return { ok: true, message: `@${username} اضافه شد` };
}

const connectSchema = z.object({
  igUserId: z.string().trim().regex(/^\d{5,25}$/, { error: "شناسه عددی حساب اینستاگرام را وارد کنید" }),
  token: z.string().trim().min(20, { error: "توکن دسترسی را کامل وارد کنید" }),
});

// Admins paste the Graph API page id and long-lived token from Meta's dashboard
export async function connectAccount(clientId: string, accountId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireAdmin();
  const account = await accountOfClient(clientId, accountId);
  if (!account || account.kind !== "own") return { message: "پیج پیدا نشد" };
  if (!canEncrypt()) return { message: "برای ذخیره امن توکن، TOKEN_SECRET را در تنظیمات سرور قرار دهید." };
  const parsed = connectSchema.safeParse({ igUserId: formData.get("igUserId") ?? "", token: formData.get("token") ?? "" });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>, values: { igUserId: String(formData.get("igUserId") ?? "") } };
  }
  const accessToken = seal(parsed.data.token);
  await db
    .update(schema.igAccounts)
    .set({ igUserId: parsed.data.igUserId, accessToken, lastError: null })
    .where(eq(schema.igAccounts.id, account.id));
  await audit(user.id, "connect", "ig_account", account.id);
  const result = await syncAccount({ ...account, igUserId: parsed.data.igUserId, accessToken });
  revalidateGrowth(clientId);
  return result.ok
    ? { ok: true, message: "وصل شد و آمار امروز دریافت شد" }
    : { message: `ذخیره شد، ولی دریافت آمار خطا داد: ${result.error}` };
}

export async function removeAccount(clientId: string, accountId: string): Promise<void> {
  const user = await requireTeam();
  const account = await accountOfClient(clientId, accountId);
  if (!account) return;
  if (account.kind === "own" && user.role !== "admin") return;
  await db.delete(schema.igAccounts).where(eq(schema.igAccounts.id, account.id));
  await audit(user.id, "delete", "ig_account", account.id, { username: account.username });
  revalidateGrowth(clientId);
}

export async function syncNow(clientId: string, accountId: string): Promise<FormState> {
  await requireTeam();
  const account = await accountOfClient(clientId, accountId);
  if (!account) return { message: "پیج پیدا نشد" };
  const result = await syncAccount(account);
  revalidateGrowth(clientId);
  return result.ok ? { ok: true, message: "به‌روز شد" } : { message: `خطا: ${result.error}` };
}

export async function addDailyEntry(clientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const values = Object.fromEntries(["accountId", "day", "followers", "reach", "views"].map((k) => [k, String(formData.get(k) ?? "")]));
  const account = await accountOfClient(clientId, values.accountId);
  if (!account) return { message: "پیج را انتخاب کنید", values };
  const day = parseDay(values.day);
  const followers = parseCount(values.followers);
  const reach = parseCount(values.reach);
  const views = parseCount(values.views);
  const errors: Record<string, string[]> = {};
  if (!day) errors.day = ["تاریخ را مثل ۱۴۰۵/۰۷/۲۷ بنویسید"];
  if (followers == null || Number.isNaN(followers)) errors.followers = ["تعداد فالوور را بنویسید"];
  if (Number.isNaN(reach)) errors.reach = ["عدد نامعتبر"];
  if (Number.isNaN(views)) errors.views = ["عدد نامعتبر"];
  if (Object.keys(errors).length) return { errors, values };

  await upsertDay(account.id, day!, { followers, reach: reach ?? undefined, views: views ?? undefined });
  await audit(user.id, "update", "ig_daily_stats", account.id, { day });
  revalidateGrowth(clientId);
  return { ok: true, message: "ثبت شد" };
}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

// Daily stats (date, followers, reach, views) or posts (date, link, type,
// views, likes, comments, saves, shares, caption), with English or Persian headers
export async function importCsv(clientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireTeam();
  const values = { accountId: String(formData.get("accountId") ?? ""), kind: String(formData.get("kind") ?? "daily") };
  const account = await accountOfClient(clientId, values.accountId);
  if (!account) return { message: "پیج را انتخاب کنید", values };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { errors: { file: ["فایل CSV را انتخاب کنید"] }, values };
  if (file.size > MAX_IMPORT_BYTES) return { errors: { file: ["فایل بزرگ‌تر از ۲ مگابایت است"] }, values };

  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { errors: { file: ["فایل خالی است یا سطر عنوان ندارد"] }, values };
  const col = mapHeader(rows[0]);
  if (col.date === undefined) return { errors: { file: ["ستون تاریخ (date یا تاریخ) پیدا نشد"] }, values };

  const problems: string[] = [];
  let saved = 0;
  const cell = (r: string[], key: string) => (col[key] === undefined ? undefined : r[col[key]]);
  const num = (r: string[], key: string, line: number) => {
    const v = parseCount(cell(r, key));
    if (Number.isNaN(v)) {
      problems.push(`سطر ${toPersianDigits(line)}: ${key} عدد نیست`);
      return undefined;
    }
    return v;
  };

  if (values.kind === "posts") {
    const media = [];
    for (const [i, r] of rows.slice(1).entries()) {
      const line = i + 2;
      const when = parseDateTime(cell(r, "date") ?? "");
      if (!when) {
        problems.push(`سطر ${toPersianDigits(line)}: تاریخ نامعتبر`);
        continue;
      }
      const link = cell(r, "link")?.trim() || null;
      media.push({
        externalId: cell(r, "id")?.trim() || link || `${when.day}#${line}`,
        permalink: link && /^https?:\/\//.test(link) ? link : null,
        type: parseType(cell(r, "type")),
        caption: cell(r, "caption") || null,
        // Noon Tehran when the export has no time of day
        postedAt: when.at ?? new Date(`${when.day}T08:30:00Z`),
        views: num(r, "views", line) ?? null,
        reach: num(r, "reach", line) ?? null,
        likes: num(r, "likes", line) ?? null,
        comments: num(r, "comments", line) ?? null,
        saves: num(r, "saves", line) ?? null,
        shares: num(r, "shares", line) ?? null,
      });
    }
    await upsertPosts(account.id, media);
    saved = media.length;
    if (account.kind === "competitor") await detectSpikes(account);
  } else {
    if (col.followers === undefined && col.views === undefined && col.reach === undefined) {
      return { errors: { file: ["ستون فالوور، ریچ یا ویو پیدا نشد"] }, values };
    }
    for (const [i, r] of rows.slice(1).entries()) {
      const line = i + 2;
      const day = parseDay(cell(r, "date") ?? "");
      if (!day) {
        problems.push(`سطر ${toPersianDigits(line)}: تاریخ نامعتبر`);
        continue;
      }
      await upsertDay(account.id, day, { followers: num(r, "followers", line), reach: num(r, "reach", line), views: num(r, "views", line) });
      saved++;
    }
  }

  await audit(user.id, "import", "ig_account", account.id, { kind: values.kind, rows: saved, problems: problems.length });
  revalidateGrowth(clientId);
  const message = `${toPersianDigits(saved)} سطر ثبت شد${problems.length ? `؛ ${toPersianDigits(problems.length)} مورد خطا: ${problems.slice(0, 3).join("، ")}` : ""}`;
  return { ok: problems.length === 0, message };
}

export async function scoreContentAction(contentId: string): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(contentId)) return { message: "محتوا پیدا نشد" };
  try {
    await scoreContent(contentId, user.id);
  } catch (error) {
    return aiFailed(error);
  }
  revalidatePath(`/content/${contentId}`);
  return { ok: true };
}

export async function generateWeekly(clientId: string): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(clientId)) return { message: "مشتری پیدا نشد" };
  try {
    await weeklyReport(clientId, user.id);
  } catch (error) {
    return aiFailed(error);
  }
  revalidateGrowth(clientId);
  return { ok: true, message: "گزارش آماده شد" };
}

export async function generateIdeas(clientId: string): Promise<FormState> {
  const user = await requireTeam();
  if (!isUuid(clientId)) return { message: "مشتری پیدا نشد" };
  try {
    await trendIdeas(clientId, user.id);
  } catch (error) {
    return aiFailed(error);
  }
  revalidateGrowth(clientId);
  return { ok: true };
}

export async function explainSpikeAction(clientId: string, insightId: string): Promise<FormState> {
  await requireTeam();
  if (!isUuid(insightId)) return { message: "پیدا نشد" };
  try {
    await explainSpike(insightId);
  } catch (error) {
    return aiFailed(error);
  }
  revalidateGrowth(clientId);
  return { ok: true };
}

export async function shareReport(clientId: string, insightId: string): Promise<void> {
  const user = await requireTeam();
  if (!isUuid(clientId) || !isUuid(insightId)) return;
  const shared = await db
    .update(schema.insights)
    .set({ sharedAt: new Date() })
    .where(
      and(
        eq(schema.insights.id, insightId),
        eq(schema.insights.clientId, clientId),
        eq(schema.insights.kind, "weekly_report"),
        isNull(schema.insights.sharedAt),
      ),
    )
    .returning({ id: schema.insights.id });
  if (shared.length === 0) return;
  await audit(user.id, "share", "insight", insightId);
  await notifyClient(clientId, { title: "گزارش هفتگی پیج شما آماده است", href: `/portal/growth/reports/${insightId}` }, { sms: true });
  revalidateGrowth(clientId);
}

// Turns one AI idea into a card in the content board's idea column
export async function ideaToContent(clientId: string, insightId: string, index: number): Promise<{ ok: boolean; id?: string }> {
  const user = await requireTeam();
  if (!isUuid(clientId) || !isUuid(insightId)) return { ok: false };
  const [row] = await db
    .select({ data: schema.insights.data })
    .from(schema.insights)
    .where(and(eq(schema.insights.id, insightId), eq(schema.insights.clientId, clientId), eq(schema.insights.kind, "trend_ideas")));
  const idea = (row?.data as TrendIdeas | undefined)?.ideas[index];
  if (!idea) return { ok: false };
  const [content] = await db
    .insert(schema.contents)
    .values({
      clientId,
      title: idea.title,
      type: idea.format,
      notes: `هوک: ${idea.hook} — چرا: ${idea.why}`,
      createdBy: user.id,
    })
    .returning({ id: schema.contents.id, stage: schema.contents.stage });
  await db.insert(schema.contentEvents).values({ contentId: content.id, userId: user.id, toStage: content.stage });
  await audit(user.id, "create", "content", content.id, { title: idea.title, from: "trend_ideas" });
  revalidatePath("/content");
  return { ok: true, id: content.id };
}
