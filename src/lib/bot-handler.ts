import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ChatPending, ChatPlatform, Role } from "@/db/schema";
import { audit } from "./audit";
import {
  type ChatMessage,
  type InlineButton,
  appLink,
  botApi,
  editChat,
  linkButton,
  redeemLinkCode,
  sendChat,
} from "./bot";
import { NOT_LINKED, allowed, callback, formatDuration, helpText, menuFor, normalizeCode, parseCommand, shorten, timecodeIn, type BotCommand } from "./bot-text";
import { approveAsClient, ownContent, requestChangesAsClient } from "./client-review";
import { STAGE_LABELS } from "./content";
import { isUuid } from "./data";
import { formatJalaliDate, formatTime, formatToman, toPersianDigits } from "./format";
import { invoiceLabel } from "./invoices-data";
import { appUrl } from "./payment";
import { periodLabel } from "./payroll";
import { openStretch } from "./team-data";

// The parts of a Telegram/Bale update the bot reads
export type Update = {
  message?: { chat: { id: number | string; type?: string }; from?: { username?: string }; text?: string };
  callback_query?: {
    id: string;
    from?: { username?: string };
    data?: string;
    message?: { chat: { id: number | string }; message_id: number };
  };
};

type Member = { id: string; name: string; role: Role; clientId: string | null; linkId: string; pending: ChatPending };

async function memberFor(platform: ChatPlatform, chatId: string): Promise<Member | null> {
  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      clientId: schema.users.clientId,
      linkId: schema.chatLinks.id,
      pending: schema.chatLinks.pending,
    })
    .from(schema.chatLinks)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatLinks.userId))
    .where(and(eq(schema.chatLinks.platform, platform), eq(schema.chatLinks.chatId, chatId), eq(schema.users.active, true)));
  return row ?? null;
}

async function setPending(linkId: string, pending: ChatPending) {
  await db.update(schema.chatLinks).set({ pending }).where(eq(schema.chatLinks.id, linkId));
}

export async function handleUpdate(platform: ChatPlatform, update: Update): Promise<void> {
  if (update.callback_query) return handleCallback(platform, update.callback_query);
  const msg = update.message;
  // Private chats only; the team group just receives notifications
  if (!msg?.text || (msg.chat.type && msg.chat.type !== "private")) return;
  const chatId = String(msg.chat.id);
  const reply = (message: ChatMessage) => sendChat(platform, chatId, message);
  const parsed = parseCommand(msg.text);
  let member = await memberFor(platform, chatId);

  // "/start CODE" from a deep link, or the code typed by hand before connecting
  const code = normalizeCode(parsed?.command === "help" ? parsed.arg : !parsed && !member ? msg.text : "");
  if (code) {
    const userId = await redeemLinkCode(platform, chatId, msg.from?.username ?? null, code);
    if (!userId) return reply({ text: "این کد اتصال درست نیست یا منقضی شده است. از پنل یک کد تازه بگیرید." });
    member = await memberFor(platform, chatId);
    if (!member) return;
    await audit(member.id, "link", "chat", platform);
    return reply({ text: `✅ وصل شد.\n\n${helpText(member.name, member.role)}`, menu: menuFor(member.role) });
  }
  if (!member) return reply({ text: NOT_LINKED });

  if (parsed) {
    if (parsed.command !== "cancel" && member.pending) await setPending(member.linkId, null);
    return runCommand(platform, chatId, member, parsed.command);
  }
  if (member.pending?.kind === "changes") return takeChangeRequest(platform, chatId, member, member.pending.contentId, msg.text);
  return reply({ text: "متوجه نشدم. از دکمه‌های پایین صفحه استفاده کنید یا «راهنما» را بزنید.", menu: menuFor(member.role) });
}

async function runCommand(platform: ChatPlatform, chatId: string, member: Member, command: BotCommand): Promise<void> {
  const reply = (message: ChatMessage) => sendChat(platform, chatId, message);
  if (!allowed(member.role, command)) return reply({ text: "این بخش برای حساب شما نیست.", menu: menuFor(member.role) });
  switch (command) {
    case "help":
      return reply({ text: helpText(member.name, member.role), menu: menuFor(member.role) });
    case "cancel":
      await setPending(member.linkId, null);
      return reply({ text: "لغو شد.", menu: menuFor(member.role) });
    case "unlink":
      await db.delete(schema.chatLinks).where(eq(schema.chatLinks.id, member.linkId));
      await audit(member.id, "unlink", "chat", platform);
      return reply({ text: "اتصال این گفتگو به پنل قطع شد. هر وقت خواستید از پنل دوباره وصل شوید." });
    case "tasks":
      return reply(await taskList(member.id));
    case "today":
      return reply({ text: await todayDigest(member.id), menu: menuFor(member.role) });
    case "clockin":
      return reply(await clockInPrompt(member.id));
    case "clockout":
      return reply({ text: await clockOutNow(member.id), menu: menuFor(member.role) });
    case "review":
      return sendReviewList(platform, chatId, member.clientId!);
    case "invoices":
      return reply(await openInvoices(member.clientId!));
    case "reports":
      return reply(await reportList(member.clientId!));
  }
}

async function handleCallback(platform: ChatPlatform, query: NonNullable<Update["callback_query"]>): Promise<void> {
  const answer = (text?: string) => botApi(platform, "answerCallbackQuery", { callback_query_id: query.id, text }).catch(() => {});
  const chatId = query.message ? String(query.message.chat.id) : null;
  const action = query.data ? callback(query.data) : null;
  if (!chatId || !action) return void (await answer());
  const member = await memberFor(platform, chatId);
  if (!member) return void (await answer("این گفتگو به پنل وصل نیست"));
  const messageId = query.message!.message_id;
  const edit = (message: ChatMessage) => editChat(platform, chatId, messageId, message);

  if (action.verb === "td" && member.role !== "client") {
    const text = await completeTask(member, action.id);
    await answer(text);
    return edit(await taskList(member.id));
  }
  if (action.verb === "ci" && member.role !== "client") {
    const text = await clockInNow(member.id, action.id === "-" ? null : action.id);
    await answer();
    return edit({ text });
  }
  if ((action.verb === "ap" || action.verb === "ch") && member.role === "client" && member.clientId && isUuid(action.id)) {
    const content = await ownContent(action.id, member.clientId);
    if (!content || content.stage !== "client_review") {
      await answer();
      return edit({ text: content ? `«${content.title}» دیگر منتظر بررسی شما نیست (${STAGE_LABELS[content.stage]}).` : "این محتوا پیدا نشد." });
    }
    if (action.verb === "ap") {
      await approveAsClient({ id: member.id, name: member.name, clientId: member.clientId }, content);
      await answer("تأیید شد");
      return edit({ text: `✅ «${content.title}» را تأیید کردید. ممنون!` });
    }
    await setPending(member.linkId, { kind: "changes", contentId: content.id });
    await answer();
    return sendChat(platform, chatId, {
      text: `بنویسید در «${content.title}» چه چیزی باید تغییر کند. اگر درباره لحظه خاصی از ویدیو است، زمانش را هم بنویسید (مثلاً ۰:۱۵).\nبرای لغو «انصراف» را بفرستید.`,
    });
  }
  await answer();
}

// --- Team -------------------------------------------------------------------

async function taskList(userId: string): Promise<ChatMessage> {
  const tasks = await db
    .select({ id: schema.tasks.id, title: schema.tasks.title, dueAt: schema.tasks.dueAt, clientName: schema.clients.name })
    .from(schema.tasks)
    .leftJoin(schema.clients, eq(schema.clients.id, schema.tasks.clientId))
    .where(and(eq(schema.tasks.assigneeId, userId), ne(schema.tasks.status, "done")))
    .orderBy(sql`${schema.tasks.dueAt} asc nulls last`, asc(schema.tasks.createdAt))
    .limit(10);
  if (tasks.length === 0) return { text: "🎉 کار بازی ندارید." };
  const now = new Date();
  const lines = tasks.map((t, i) => {
    const due = t.dueAt ? ` · ${t.dueAt < now ? "⚠️ دیرشده " : "مهلت "}${formatJalaliDate(t.dueAt)}` : "";
    return `${toPersianDigits(i + 1)}. ${t.title}${t.clientName ? ` (${t.clientName})` : ""}${due}`;
  });
  return {
    text: ["📋 کارهای باز شما:", ...lines, "", "برای انجام‌شده کردن، دکمه همان کار را بزنید."].join("\n"),
    buttons: [
      ...tasks.map((t, i): InlineButton[] => [{ text: `✓ ${toPersianDigits(i + 1)}. ${shorten(t.title)}`, data: `td:${t.id}` }]),
      ...[linkButton("همه کارها در پنل", appLink("/tasks"))].filter((r) => r.length),
    ],
  };
}

async function completeTask(member: Member, taskId: string): Promise<string> {
  if (!isUuid(taskId)) return "پیدا نشد";
  const [task] = await db
    .update(schema.tasks)
    .set({ status: "done", completedAt: new Date() })
    .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.assigneeId, member.id), ne(schema.tasks.status, "done")))
    .returning({ title: schema.tasks.title });
  if (!task) return "این کار قبلاً بسته شده است";
  await audit(member.id, "status", "task", taskId, { status: "done", via: "bot" });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return `انجام شد: ${shorten(task.title, 40)}`;
}

// Today's work for one person: overdue and due-today tasks, shoots, content deadlines
export async function todayDigest(userId: string, now: Date = new Date()): Promise<string> {
  const end = new Date(endOfTehranDay(now));
  const start = new Date(end.getTime() - 86400_000);
  const [tasks, shoots, contents, stretch] = await Promise.all([
    db
      .select({ title: schema.tasks.title, dueAt: schema.tasks.dueAt })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.assigneeId, userId), ne(schema.tasks.status, "done"), isNotNull(schema.tasks.dueAt), lt(schema.tasks.dueAt, end)))
      .orderBy(asc(schema.tasks.dueAt))
      .limit(15),
    db
      .select({ title: schema.shoots.title, startsAt: schema.shoots.startsAt, location: schema.shoots.location, clientName: schema.clients.name })
      .from(schema.shoots)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.shoots.clientId))
      .where(and(eq(schema.shoots.crewId, userId), gte(schema.shoots.startsAt, start), lt(schema.shoots.startsAt, end)))
      .orderBy(asc(schema.shoots.startsAt)),
    db
      .select({ title: schema.contents.title, stage: schema.contents.stage, dueAt: schema.contents.dueAt })
      .from(schema.contents)
      .where(
        and(
          eq(schema.contents.assigneeId, userId),
          inArray(schema.contents.stage, ["idea", "shot", "editing", "internal_review"]),
          isNotNull(schema.contents.dueAt),
          lt(schema.contents.dueAt, end),
        ),
      )
      .orderBy(asc(schema.contents.dueAt))
      .limit(10),
    openStretch(userId),
  ]);
  const late = (d: Date | null) => (d && d < start ? " ⚠️ دیرشده" : "");
  const parts = ["🗓 برنامه امروز"];
  if (shoots.length) parts.push("", "🎥 ضبط:", ...shoots.map((s) => `• ساعت ${formatTime(s.startsAt)} · ${s.title} (${s.clientName})${s.location ? ` · ${s.location}` : ""}`));
  if (tasks.length) parts.push("", "📋 کارها:", ...tasks.map((t) => `• ${t.title}${late(t.dueAt)}`));
  if (contents.length) parts.push("", "🎬 مهلت محتوا:", ...contents.map((c) => `• ${c.title} · ${STAGE_LABELS[c.stage]}${late(c.dueAt)}`));
  if (parts.length === 1) parts.push("", "برای امروز کار مهلت‌داری ندارید.");
  parts.push("", stretch ? `⏱ از ساعت ${formatTime(stretch.stretch.clockIn)} ورود زده‌اید.` : "⏱ هنوز ورود نزده‌اید.");
  return parts.join("\n");
}

// Midnight at the end of today, Tehran time (Iran has no daylight saving)
function endOfTehranDay(now: Date): number {
  const offset = 3.5 * 3600_000;
  const local = now.getTime() + offset;
  return Math.floor(local / 86400_000) * 86400_000 + 86400_000 - offset;
}

async function clockInPrompt(userId: string): Promise<ChatMessage> {
  const [stretch, clients] = await Promise.all([
    openStretch(userId),
    db
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients)
      .where(eq(schema.clients.status, "active"))
      .orderBy(asc(schema.clients.name))
      .limit(12),
  ]);
  const choices: InlineButton[][] = [];
  for (let i = 0; i < clients.length; i += 2) {
    choices.push(clients.slice(i, i + 2).map((c) => ({ text: shorten(c.name, 24), data: `ci:${c.id}` })));
  }
  choices.push([{ text: "بدون مشتری مشخص", data: "ci:-" }]);
  const text = stretch
    ? `از ساعت ${formatTime(stretch.stretch.clockIn)} ورود زده‌اید${stretch.clientName ? ` (${stretch.clientName})` : ""}.\nاگر روی مشتری دیگری کار می‌کنید، انتخابش کنید:`
    : "روی کار کدام مشتری هستید؟";
  return { text, buttons: choices };
}

async function clockInNow(userId: string, clientId: string | null): Promise<string> {
  if (clientId && !isUuid(clientId)) return "مشتری پیدا نشد";
  const now = new Date();
  const switched = await db.transaction(async (tx) => {
    const closed = await tx
      .update(schema.attendance)
      .set({ clockOut: now })
      .where(and(eq(schema.attendance.userId, userId), isNull(schema.attendance.clockOut)))
      .returning({ id: schema.attendance.id });
    await tx.insert(schema.attendance).values({ userId, clientId, clockIn: now });
    return closed.length > 0;
  });
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  const [client] = clientId ? await db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, clientId)) : [];
  const on = client ? ` · ${client.name}` : "";
  return switched ? `🔁 از ساعت ${formatTime(now)} روی کار جدید${on}` : `🟢 ورود ثبت شد · ساعت ${formatTime(now)}${on}`;
}

async function clockOutNow(userId: string): Promise<string> {
  const now = new Date();
  const closed = await db
    .update(schema.attendance)
    .set({ clockOut: now })
    .where(and(eq(schema.attendance.userId, userId), isNull(schema.attendance.clockOut)))
    .returning({ clockIn: schema.attendance.clockIn });
  if (closed.length === 0) return "ورودی ثبت نشده بود.";
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  // Today's total, counting every stretch since midnight
  const dayStart = new Date(endOfTehranDay(now) - 86400_000);
  const today = await db
    .select({ clockIn: schema.attendance.clockIn, clockOut: schema.attendance.clockOut })
    .from(schema.attendance)
    .where(and(eq(schema.attendance.userId, userId), or(gte(schema.attendance.clockIn, dayStart), gte(schema.attendance.clockOut, dayStart))));
  const minutes = today.reduce((sum, s) => sum + ((s.clockOut ?? now).getTime() - Math.max(s.clockIn.getTime(), dayStart.getTime())) / 60_000, 0);
  return `🔴 خروج ثبت شد · ساعت ${formatTime(now)}\nکار امروز: ${formatDuration(minutes)}. خسته نباشید!`;
}

// --- Clients ---------------------------------------------------------------

async function sendReviewList(platform: ChatPlatform, chatId: string, clientId: string): Promise<void> {
  const waiting = await db
    .select({ id: schema.contents.id, title: schema.contents.title })
    .from(schema.contents)
    .where(and(eq(schema.contents.clientId, clientId), eq(schema.contents.stage, "client_review")))
    .orderBy(asc(schema.contents.updatedAt))
    .limit(5);
  if (waiting.length === 0) return sendChat(platform, chatId, { text: "✨ محتوایی منتظر تأیید شما نیست." });
  // One message per item, so each keeps its own buttons
  for (const c of waiting) {
    const url = appLink(`/portal/content/${c.id}`);
    const open = linkButton("دیدن ویدیو", url);
    await sendChat(platform, chatId, {
      text: [`📝 «${c.title}» منتظر نظر شماست.`, open.length ? null : url].filter(Boolean).join("\n"),
      buttons: [
        [{ text: "✅ تأیید", data: `ap:${c.id}` }, { text: "✏️ اصلاحیه دارم", data: `ch:${c.id}` }],
        ...(open.length ? [open] : []),
      ],
    });
  }
}

async function takeChangeRequest(platform: ChatPlatform, chatId: string, member: Member, contentId: string, text: string): Promise<void> {
  await setPending(member.linkId, null);
  const content = member.clientId ? await ownContent(contentId, member.clientId) : null;
  if (!content || content.stage !== "client_review") {
    return sendChat(platform, chatId, { text: "این محتوا دیگر منتظر بررسی شما نیست.", menu: menuFor(member.role) });
  }
  const body = text.trim().slice(0, 2000);
  await requestChangesAsClient({ id: member.id, name: member.name, clientId: member.clientId! }, content, body, timecodeIn(body));
  return sendChat(platform, chatId, { text: `✏️ اصلاحیه «${content.title}» برای تیم فرستاده شد. نسخه جدید که آماده شد خبرتان می‌کنیم.`, menu: menuFor(member.role) });
}

async function openInvoices(clientId: string): Promise<ChatMessage> {
  const invoices = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.clientId, clientId), eq(schema.invoices.status, "sent")))
    .orderBy(asc(schema.invoices.issuedOn))
    .limit(5);
  if (invoices.length === 0) return { text: "✅ فاکتور پرداخت‌نشده‌ای ندارید." };
  const today = new Date().toISOString().slice(0, 10);
  const lines = invoices.map((inv) => {
    const due = inv.dueOn ? ` · ${inv.dueOn < today ? "⚠️ سررسید گذشته" : "سررسید"} ${formatJalaliDate(new Date(`${inv.dueOn}T12:00:00Z`))}` : "";
    return `• ${invoiceLabel(inv.number)}: ${inv.title} · ${formatToman(inv.total)}${due}`;
  });
  const pay = invoices.map((inv) => linkButton(`پرداخت ${invoiceLabel(inv.number)}`, `${appUrl()}/pay/${inv.payToken}`)).filter((r) => r.length);
  return {
    text: ["🧾 فاکتورهای باز:", ...lines, ...(pay.length ? [] : ["", ...invoices.map((inv) => `${appUrl()}/pay/${inv.payToken}`)])].join("\n"),
    buttons: pay,
  };
}

async function reportList(clientId: string): Promise<ChatMessage> {
  const reports = await db
    .select({ id: schema.monthlyReports.id, period: schema.monthlyReports.period })
    .from(schema.monthlyReports)
    .where(and(eq(schema.monthlyReports.clientId, clientId), isNotNull(schema.monthlyReports.sharedAt)))
    .orderBy(desc(schema.monthlyReports.period))
    .limit(4);
  if (reports.length === 0) return { text: "هنوز گزارش ماهانه‌ای برای شما فرستاده نشده است." };
  const rows = reports.map((r) => ({ label: `گزارش ${periodLabel(r.period)}`, url: appLink(`/portal/reports/${r.id}`) }));
  const buttons = rows.map((r) => linkButton(r.label, r.url)).filter((b) => b.length);
  return {
    text: ["📊 گزارش‌های ماهانه:", ...rows.map((r) => `• ${r.label}${buttons.length ? "" : `\n${r.url ?? ""}`}`)].join("\n"),
    buttons,
  };
}
