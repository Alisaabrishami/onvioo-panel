import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, bestSlots, buildForecast, followerChange, followerSeries, performance, tehranDay, type DayPoint } from "./growth";
import { accountsOf, dailyStats, postsOf, reelDays } from "./growth-data";

// Everything the growth page (panel and portal) shows for one client
export async function loadGrowth(clientId: string, opts: { sharedOnly?: boolean } = {}) {
  const accounts = await accountsOf(clientId);
  const own = accounts.filter((a) => a.kind === "own");
  const rivals = accounts.filter((a) => a.kind === "competitor");
  const today = tehranDay();
  const since = addDays(today, -120);

  const [stats, ownPosts, rivalPosts, rivalStats, reels, insights] = await Promise.all([
    dailyStats(own.map((a) => a.id), since),
    postsOf(own.map((a) => a.id), new Date(Date.now() - 90 * 24 * 3600 * 1000)),
    postsOf(rivals.map((a) => a.id), new Date(Date.now() - 30 * 24 * 3600 * 1000)),
    dailyStats(rivals.map((a) => a.id), addDays(today, -40)),
    reelDays(clientId, own.map((a) => a.id), since),
    db
      .select()
      .from(schema.insights)
      .where(
        and(
          eq(schema.insights.clientId, clientId),
          inArray(schema.insights.kind, opts.sharedOnly ? ["weekly_report"] : ["weekly_report", "trend_ideas", "competitor_spike"]),
          opts.sharedOnly ? isNotNull(schema.insights.sharedAt) : undefined,
        ),
      )
      .orderBy(desc(schema.insights.createdAt))
      .limit(40),
  ]);

  // With several own pages, the main (first) one drives the headline numbers
  const mainId = own[0]?.id;
  const mainStats: DayPoint[] = stats.filter((s) => s.accountId === mainId);
  const series = followerSeries(mainStats).map((p) => ({ day: p.day, value: p.followers }));
  const viewsSeries = mainStats
    .filter((s) => s.day > addDays(today, -31) && s.views != null)
    .map((s) => ({ day: s.day, value: s.views! }));
  const ranked = [...ownPosts].sort((a, b) => performance(b) - performance(a));

  const rivalSummary = rivals.map((r) => {
    const rs = rivalStats.filter((s) => s.accountId === r.id);
    const posts = rivalPosts.filter((p) => p.accountId === r.id);
    return {
      account: r,
      followers: followerSeries(rs).at(-1)?.followers ?? null,
      change30: followerChange(rs, 30),
      best: [...posts].sort((a, b) => performance(b) - performance(a))[0] ?? null,
    };
  });
  const postById = new Map([...ownPosts, ...rivalPosts].map((p) => [p.id, p]));

  return {
    accounts,
    own,
    rivals,
    rivalSummary,
    series: series.filter((p) => p.day > addDays(today, -90)),
    viewsSeries,
    followers: series.at(-1)?.value ?? null,
    change1: followerChange(mainStats, 1),
    change7: followerChange(mainStats, 7),
    change30: followerChange(mainStats, 30),
    views30: viewsSeries.reduce((s, p) => s + p.value, 0),
    forecast: buildForecast(mainStats, reels),
    ownPosts,
    top: ranked.slice(0, 5),
    bottom: ranked.length > 5 ? ranked.slice(-3).reverse() : [],
    slots: bestSlots(ownPosts),
    reports: insights.filter((i) => i.kind === "weekly_report"),
    ideas: insights.find((i) => i.kind === "trend_ideas") ?? null,
    spikes: insights
      .filter((i) => i.kind === "competitor_spike")
      .slice(0, 6)
      .map((i) => ({ insight: i, post: i.postId ? (postById.get(i.postId) ?? null) : null })),
  };
}

export type GrowthView = Awaited<ReturnType<typeof loadGrowth>>;
