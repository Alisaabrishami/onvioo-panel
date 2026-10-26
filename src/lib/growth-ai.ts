import "server-only";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import { db, schema } from "@/db";
import { askClaude } from "./ai";
import { TYPE_LABELS } from "./content";
import { toPersianDigits } from "./format";
import { addDays, bestSlots, engagementRate, followerChange, performance, tehranDay } from "./growth";
import { accountsOf, dailyStats, postsOf, type Post } from "./growth-data";

const SYSTEM = `You are the growth strategist of Onvioo, an Instagram content agency in Iran that makes reels and stories for local businesses (cafés, beauty salons, clothing shops and similar).
Write every answer in natural, concise Persian (Farsi) that a busy agency owner or client reads in seconds. Be specific to the data given; never invent numbers that are not in it.
When data is thin, say so briefly and still give the most useful concrete advice.`;

export const viralSchema = z.object({
  score: z.number().int().min(0).max(100).describe("Overall chance this content performs well on Instagram, 0-100"),
  parts: z.object({
    hook: z.number().int().min(0).max(10).describe("Strength of the first 3 seconds / opening line"),
    caption: z.number().int().min(0).max(10),
    hashtags: z.number().int().min(0).max(10),
    timing: z.number().int().min(0).max(10).describe("Planned publish time vs. when this page's audience responds"),
    trend: z.number().int().min(0).max(10).describe("Fit with what is working now for this page and its competitors"),
  }),
  summary: z.string().describe("One or two sentences: the verdict and the single biggest lever"),
  suggestions: z.array(z.string()).min(1).max(5).describe("Concrete changes, most impactful first"),
  betterHook: z.string().describe("A rewritten opening line / on-screen text for the first 3 seconds"),
  betterCaption: z.string().describe("An improved caption in the brand's voice, without hashtags"),
});
export type ViralScore = z.infer<typeof viralSchema>;

export const weeklySchema = z.object({
  headline: z.string().describe("One-line summary of the week, e.g. the main win or problem"),
  summary: z.string().describe("A short paragraph explaining the week's numbers in plain words"),
  worked: z.array(z.string()).max(4).describe("What worked and why"),
  didnt: z.array(z.string()).max(4).describe("What underperformed and why"),
  nextWeek: z.array(z.string()).min(1).max(5).describe("Concrete content to make next week"),
});
export type WeeklyReport = z.infer<typeof weeklySchema> & { stats: WeeklyStats };

export const trendSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().describe("Short working title for the content"),
        format: z.enum(["reel", "story", "carousel", "post"]),
        hook: z.string().describe("The first 3 seconds: what is seen and said"),
        why: z.string().describe("Which observed pattern this builds on"),
      }),
    )
    .min(3)
    .max(6),
});
export type TrendIdeas = z.infer<typeof trendSchema>;

export const spikeSchema = z.object({
  why: z.string().describe("Why this post likely took off, in two or three sentences"),
  takeaways: z.array(z.string()).min(1).max(3).describe("How our client can use the same idea"),
});

type WeeklyStats = {
  followers: number | null;
  change7: number | null;
  views7: number;
  reach7: number;
  posts7: number;
  topPosts: { caption: string; views: number; permalink: string | null }[];
};

function postLine(p: Post, owner?: string): string {
  const er = engagementRate(p);
  return [
    owner ? `@${owner}` : null,
    TYPE_LABELS[p.type],
    tehranDay(p.postedAt),
    p.views != null ? `views ${p.views}` : null,
    p.likes != null ? `likes ${p.likes}` : null,
    p.comments != null ? `comments ${p.comments}` : null,
    p.saves != null ? `saves ${p.saves}` : null,
    p.shares != null ? `shares ${p.shares}` : null,
    er != null ? `engagement ${er.toFixed(1)}%` : null,
    `caption: ${(p.caption ?? "").replace(/\s+/g, " ").slice(0, 220)}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function clientContext(clientId: string) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw new Error("client not found");
  const accounts = await accountsOf(clientId);
  const own = accounts.filter((a) => a.kind === "own");
  const rivals = accounts.filter((a) => a.kind === "competitor");
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const [ownPosts, rivalPosts, stats] = await Promise.all([
    postsOf(own.map((a) => a.id), since),
    postsOf(rivals.map((a) => a.id), new Date(Date.now() - 21 * 24 * 3600 * 1000)),
    dailyStats(own.map((a) => a.id), addDays(tehranDay(), -60)),
  ]);
  const username = new Map(accounts.map((a) => [a.id, a.username]));
  const about = [client.name, client.brand, client.notes].filter(Boolean).join(" — ");
  return { client, about, own, rivals, ownPosts, rivalPosts, stats, username };
}

function rank(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => performance(b) - performance(a));
}

async function save(kind: "viral_score" | "weekly_report" | "trend_ideas", clientId: string, data: unknown, userId: string | null, contentId?: string) {
  const [row] = await db
    .insert(schema.insights)
    .values({ kind, clientId, contentId, data, createdBy: userId })
    .returning({ id: schema.insights.id });
  return row.id;
}

export async function scoreContent(contentId: string, userId: string): Promise<ViralScore> {
  const [content] = await db.select().from(schema.contents).where(eq(schema.contents.id, contentId));
  if (!content) throw new Error("content not found");
  const ctx = await clientContext(content.clientId);
  const ranked = rank(ctx.ownPosts);
  const slots = bestSlots(ctx.ownPosts);
  const [script] = await db
    .select({ body: schema.contentComments.body })
    .from(schema.contentComments)
    .where(eq(schema.contentComments.contentId, contentId))
    .orderBy(desc(schema.contentComments.createdAt))
    .limit(1);

  const prompt = `Score this planned Instagram ${content.type} for the page of «${ctx.about}» before it is published.

PLANNED CONTENT
Title: ${content.title}
Type: ${TYPE_LABELS[content.type]}
Planned publish time (Tehran): ${content.publishAt ? content.publishAt.toLocaleString("en-GB", { timeZone: "Asia/Tehran" }) : "not set"}
Caption: ${content.caption ?? "(none yet)"}
Hashtags: ${content.hashtags ?? "(none yet)"}
Script / notes: ${content.notes ?? "(none)"}
Latest team note: ${script?.body ?? "(none)"}

THIS PAGE'S BEST RECENT POSTS
${ranked.slice(0, 5).map((p) => postLine(p)).join("\n") || "(no data yet)"}

THIS PAGE'S WEAKEST RECENT POSTS
${ranked.slice(-3).map((p) => postLine(p)).join("\n") || "(no data yet)"}

BEST PUBLISH SLOTS (avg views, Tehran time): ${slots.hours.slice(0, 3).map((s) => `${s.label}: ${Math.round(s.avg)}`).join("; ") || "unknown"}

WHAT IS WORKING FOR COMPETITORS (last 3 weeks)
${rank(ctx.rivalPosts).slice(0, 5).map((p) => postLine(p, ctx.username.get(p.accountId))).join("\n") || "(no competitor data)"}`;

  const result = await askClaude({
    system: SYSTEM,
    prompt,
    schema: viralSchema,
    toolName: "viral_score",
    toolDescription: "Record the viral score, sub-scores and concrete improvements for the planned content.",
    mock: () => mockViral(content.title, !!content.caption, !!content.hashtags, ranked.length),
  });
  await save("viral_score", content.clientId, result, userId, contentId);
  return result;
}

export async function weeklyReport(clientId: string, userId: string | null): Promise<string> {
  const ctx = await clientContext(clientId);
  const today = tehranDay();
  const weekAgo = addDays(today, -7);
  const thisWeek = ctx.ownPosts.filter((p) => tehranDay(p.postedAt) > weekAgo);
  const lastWeek = ctx.ownPosts.filter((p) => tehranDay(p.postedAt) > addDays(today, -14) && tehranDay(p.postedAt) <= weekAgo);
  const dayRows = ctx.stats.filter((s) => s.day > weekAgo);
  const followers = [...ctx.stats].reverse().find((s) => s.followers != null)?.followers ?? null;
  const stats: WeeklyStats = {
    followers,
    change7: followerChange(ctx.stats, 7),
    views7: dayRows.reduce((s, d) => s + (d.views ?? 0), 0),
    reach7: dayRows.reduce((s, d) => s + (d.reach ?? 0), 0),
    posts7: thisWeek.length,
    topPosts: rank(thisWeek)
      .slice(0, 3)
      .map((p) => ({ caption: (p.caption ?? "").slice(0, 80), views: performance(p), permalink: p.permalink })),
  };

  const prompt = `Write this week's Instagram report for «${ctx.about}». The client and the agency both read it.

NUMBERS
Followers now: ${stats.followers ?? "unknown"}; change in 7 days: ${stats.change7 ?? "unknown"}; change in 30 days: ${followerChange(ctx.stats, 30) ?? "unknown"}
Page views this week: ${stats.views7}; reach this week: ${stats.reach7}

POSTS THIS WEEK
${thisWeek.map((p) => postLine(p)).join("\n") || "(nothing posted this week)"}

POSTS LAST WEEK (for comparison)
${lastWeek.map((p) => postLine(p)).join("\n") || "(none)"}

COMPETITORS' STRONGEST POSTS (last 3 weeks)
${rank(ctx.rivalPosts).slice(0, 5).map((p) => postLine(p, ctx.username.get(p.accountId))).join("\n") || "(no competitor data)"}`;

  const result = await askClaude({
    system: SYSTEM,
    prompt,
    schema: weeklySchema,
    toolName: "weekly_report",
    toolDescription: "Record the weekly Instagram report.",
    maxTokens: 3000,
    mock: () => mockWeekly(ctx.client.name, stats),
  });
  return save("weekly_report", clientId, { ...result, stats }, userId);
}

export async function trendIdeas(clientId: string, userId: string): Promise<TrendIdeas> {
  const ctx = await clientContext(clientId);
  const prompt = `Suggest ready-to-shoot content ideas for «${ctx.about}» based on what is working right now on this page and on the competitor pages we watch.

THIS PAGE'S BEST POSTS (last 2 months)
${rank(ctx.ownPosts).slice(0, 8).map((p) => postLine(p)).join("\n") || "(no data yet)"}

COMPETITORS' BEST POSTS (last 3 weeks)
${rank(ctx.rivalPosts).slice(0, 10).map((p) => postLine(p, ctx.username.get(p.accountId))).join("\n") || "(no competitor data)"}

Prefer reels. Each idea must be shootable by a small team in one session at the client's location.`;

  const result = await askClaude({
    system: SYSTEM,
    prompt,
    schema: trendSchema,
    toolName: "content_ideas",
    toolDescription: "Record the content ideas.",
    maxTokens: 2500,
    mock: () => mockTrends(ctx.client.name),
  });
  await save("trend_ideas", clientId, result, userId);
  return result;
}

export async function explainSpike(insightId: string): Promise<void> {
  const [row] = await db
    .select({ insight: schema.insights, post: schema.igPosts })
    .from(schema.insights)
    .innerJoin(schema.igPosts, eq(schema.igPosts.id, schema.insights.postId))
    .where(and(eq(schema.insights.id, insightId), eq(schema.insights.kind, "competitor_spike")));
  if (!row) throw new Error("spike not found");
  const ctx = await clientContext(row.insight.clientId);
  const data = row.insight.data as { username: string; ratio: number };
  const others = ctx.rivalPosts.filter((p) => p.accountId === row.post.accountId && p.id !== row.post.id);

  const result = await askClaude({
    system: SYSTEM,
    prompt: `A competitor of «${ctx.about}» just had a post do ${data.ratio}× its usual numbers. Explain why and how our client can use it.

THE POST
${postLine(row.post, data.username)}

THAT PAGE'S OTHER RECENT POSTS
${others.slice(0, 8).map((p) => postLine(p)).join("\n") || "(none)"}`,
    schema: spikeSchema,
    toolName: "spike_analysis",
    toolDescription: "Record why the post took off and the takeaways.",
    mock: () => ({
      why: "این پست با یک سؤال مستقیم شروع می‌شود و موضوعش برای همه آشناست، برای همین سیو و اشتراک زیادی گرفته است.",
      takeaways: ["همین قالب سؤال و جواب را با منوی خودتان بسازید", "هوک را در یک ثانیه اول روی تصویر بنویسید"],
    }),
  });
  await db
    .update(schema.insights)
    .set({ data: { ...data, ...result } })
    .where(eq(schema.insights.id, insightId));
}

// --- Local answers for AI_DRIVER=mock ------------------------------------

function mockViral(title: string, hasCaption: boolean, hasTags: boolean, history: number): ViralScore {
  const caption = hasCaption ? 7 : 3;
  const hashtags = hasTags ? 6 : 2;
  const score = Math.min(95, 40 + caption * 3 + hashtags * 2 + Math.min(history, 5));
  return {
    score,
    parts: { hook: 6, caption, hashtags, timing: 7, trend: 6 },
    summary: `«${title}» پتانسیل خوبی دارد؛ بزرگ‌ترین اهرم، قوی‌تر کردن سه ثانیه اول است.`,
    suggestions: [
      "سه ثانیه اول را با نمای نزدیک محصول و یک جمله سؤالی شروع کنید",
      hasCaption ? "کپشن را کوتاه‌تر کنید و یک سؤال برای کامنت اضافه کنید" : "کپشن بنویسید و در آن یک سؤال برای کامنت بگذارید",
      hasTags ? "دو هشتگ محلی (محله یا شهر) اضافه کنید" : "۵ تا ۸ هشتگ مرتبط و محلی اضافه کنید",
    ],
    betterHook: "این رو تا حالا امتحان کردی؟ 👀",
    betterCaption: "یه طعم جدید که باید حتماً امتحانش کنی. تو با چی سفارشش می‌دی؟",
  };
}

function mockWeekly(name: string, stats: WeeklyStats): z.infer<typeof weeklySchema> {
  const up = (stats.change7 ?? 0) >= 0;
  return {
    headline: up ? `هفته خوبی برای ${name}: ${toPersianDigits(stats.change7 ?? 0)} فالوور جدید` : `افت فالوور ${name} در این هفته`,
    summary: `این هفته ${toPersianDigits(stats.posts7)} محتوا منتشر شد و پیج ${toPersianDigits(stats.views7)} بازدید گرفت. ریلزهایی که با چهره و صدای آدم شروع شدند بهتر از بقیه دیده شدند.`,
    worked: ["ریلزهای پشت صحنه آماده‌سازی", "انتشار در ساعت ۲۰ تا ۲۲"],
    didnt: ["پست‌های تک‌عکس بدون متن روی تصویر"],
    nextWeek: ["یک ریلز «یک روز در کافه» از صبح تا شب", "استوری نظرسنجی برای انتخاب طعم جدید", "ریلز معرفی یکی از کارکنان"],
  };
}

function mockTrends(name: string): TrendIdeas {
  return {
    ideas: [
      { title: "سفارش مخفی منو", format: "reel", hook: "یه سفارش داریم که توی منو نیست…", why: `ریلزهای «راز» در پیج‌های هم‌حوزه ${name} چند برابر معمول دیده شده‌اند.` },
      { title: "حدس بزن چنده؟", format: "reel", hook: "به نظرت این چند تومنه؟", why: "قالب حدس قیمت کامنت زیادی می‌گیرد." },
      { title: "یک دقیقه با باریستا", format: "reel", hook: "سخت‌ترین سفارشی که تا حالا داشتی چی بوده؟", why: "محتوای چهره‌محور در پیج شما بیشترین سیو را داشته است." },
    ],
  };
}
