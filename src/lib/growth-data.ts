import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, isSpike, tehranDay, type DayPoint } from "./growth";
import { fetchCompetitor, fetchDailyInsights, fetchProfile, fetchRecentMedia, type IgMedia } from "./instagram";
import { notifyTeam } from "./notify";
import { open } from "./secret-box";

export type Account = typeof schema.igAccounts.$inferSelect;
export type Post = typeof schema.igPosts.$inferSelect;

export async function accountsOf(clientId: string): Promise<Account[]> {
  return db
    .select()
    .from(schema.igAccounts)
    .where(eq(schema.igAccounts.clientId, clientId))
    .orderBy(asc(schema.igAccounts.kind), asc(schema.igAccounts.createdAt));
}

export async function dailyStats(accountIds: string[], sinceDay: string): Promise<(DayPoint & { accountId: string })[]> {
  if (accountIds.length === 0) return [];
  return db
    .select({
      accountId: schema.igDailyStats.accountId,
      day: schema.igDailyStats.day,
      followers: schema.igDailyStats.followers,
      reach: schema.igDailyStats.reach,
      views: schema.igDailyStats.views,
    })
    .from(schema.igDailyStats)
    .where(and(inArray(schema.igDailyStats.accountId, accountIds), gte(schema.igDailyStats.day, sinceDay)))
    .orderBy(asc(schema.igDailyStats.day));
}

export async function postsOf(accountIds: string[], since: Date): Promise<Post[]> {
  if (accountIds.length === 0) return [];
  return db
    .select()
    .from(schema.igPosts)
    .where(and(inArray(schema.igPosts.accountId, accountIds), gte(schema.igPosts.postedAt, since)))
    .orderBy(desc(schema.igPosts.postedAt));
}

// Days a reel went out for this client, from Instagram and from the content board
export async function reelDays(clientId: string, ownAccountIds: string[], sinceDay: string): Promise<string[]> {
  const since = new Date(`${sinceDay}T00:00:00Z`);
  const [fromIg, fromBoard] = await Promise.all([
    ownAccountIds.length
      ? db
          .select({ at: schema.igPosts.postedAt })
          .from(schema.igPosts)
          .where(and(inArray(schema.igPosts.accountId, ownAccountIds), eq(schema.igPosts.type, "reel"), gte(schema.igPosts.postedAt, since)))
      : Promise.resolve([]),
    db
      .select({ at: schema.contents.publishAt })
      .from(schema.contents)
      .where(
        and(
          eq(schema.contents.clientId, clientId),
          eq(schema.contents.type, "reel"),
          eq(schema.contents.stage, "published"),
          isNotNull(schema.contents.publishAt),
          gte(schema.contents.publishAt, since),
        ),
      ),
  ]);
  // Instagram is the source of truth when connected; the board fills in otherwise
  const rows = fromIg.length ? fromIg : fromBoard;
  return rows.filter((r): r is { at: Date } => !!r.at).map((r) => tehranDay(r.at));
}

export async function upsertDay(accountId: string, day: string, values: { followers?: number | null; reach?: number | null; views?: number | null }) {
  const set = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  await db
    .insert(schema.igDailyStats)
    .values({ accountId, day, ...set })
    .onConflictDoUpdate({ target: [schema.igDailyStats.accountId, schema.igDailyStats.day], set });
}

export async function upsertPosts(accountId: string, media: IgMedia[]): Promise<void> {
  if (media.length === 0) return;
  await db
    .insert(schema.igPosts)
    .values(media.map((m) => ({ accountId, ...m, updatedAt: new Date() })))
    .onConflictDoUpdate({
      target: [schema.igPosts.accountId, schema.igPosts.externalId],
      set: {
        permalink: sql`excluded.permalink`,
        caption: sql`coalesce(excluded.caption, ${schema.igPosts.caption})`,
        views: sql`coalesce(excluded.views, ${schema.igPosts.views})`,
        reach: sql`coalesce(excluded.reach, ${schema.igPosts.reach})`,
        likes: sql`coalesce(excluded.likes, ${schema.igPosts.likes})`,
        comments: sql`coalesce(excluded.comments, ${schema.igPosts.comments})`,
        saves: sql`coalesce(excluded.saves, ${schema.igPosts.saves})`,
        shares: sql`coalesce(excluded.shares, ${schema.igPosts.shares})`,
        updatedAt: sql`now()`,
      },
    });
}

// A connected own page of the client (or the agency's discovery account) to look competitors up through
async function discoveryCredentials(clientId: string): Promise<{ igUserId: string; token: string } | null> {
  const [own] = await db
    .select({ igUserId: schema.igAccounts.igUserId, token: schema.igAccounts.accessToken })
    .from(schema.igAccounts)
    .where(and(eq(schema.igAccounts.clientId, clientId), eq(schema.igAccounts.kind, "own"), isNotNull(schema.igAccounts.accessToken)))
    .limit(1);
  if (own?.igUserId && own.token) return { igUserId: own.igUserId, token: open(own.token) };
  const igUserId = process.env.IG_DISCOVERY_USER_ID;
  const token = process.env.IG_DISCOVERY_TOKEN;
  return igUserId && token ? { igUserId, token } : null;
}

export type SyncResult = { accountId: string; username: string; ok: boolean; error?: string; spikes?: number };

export async function syncAccount(account: Account): Promise<SyncResult> {
  const today = tehranDay();
  try {
    if (account.kind === "own") {
      if (!account.igUserId || !account.accessToken) return { accountId: account.id, username: account.username, ok: false, error: "not connected" };
      const token = open(account.accessToken);
      const [profile, media] = await Promise.all([fetchProfile(account.igUserId, token), fetchRecentMedia(account.igUserId, token)]);
      const daily = await fetchDailyInsights(account.igUserId, token).catch(() => ({ reach: null, views: null }));
      await upsertDay(account.id, today, { followers: profile.followers });
      // Page reach and views are reported for the day that just ended
      await upsertDay(account.id, addDays(today, -1), daily);
      await upsertPosts(account.id, media);
    } else {
      const creds = await discoveryCredentials(account.clientId);
      if (!creds) return { accountId: account.id, username: account.username, ok: false, error: "no connected page to look competitors up through" };
      const c = await fetchCompetitor(creds.igUserId, creds.token, account.username);
      await upsertDay(account.id, today, { followers: c.followers });
      await upsertPosts(account.id, c.media);
    }
    const spikes = account.kind === "competitor" ? await detectSpikes(account) : 0;
    await db.update(schema.igAccounts).set({ lastSyncAt: new Date(), lastError: null }).where(eq(schema.igAccounts.id, account.id));
    return { accountId: account.id, username: account.username, ok: true, spikes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(schema.igAccounts).set({ lastError: message.slice(0, 500) }).where(eq(schema.igAccounts.id, account.id));
    return { accountId: account.id, username: account.username, ok: false, error: message };
  }
}

// A competitor post from the last 10 days far above that page's median gets
// one alert, so the team can look at why it worked
export async function detectSpikes(account: Account): Promise<number> {
  const posts = await postsOf([account.id], new Date(Date.now() - 90 * 24 * 3600 * 1000));
  const recentCutoff = Date.now() - 10 * 24 * 3600 * 1000;
  const recent = posts.filter((p) => p.postedAt.getTime() >= recentCutoff);
  if (recent.length === 0) return 0;
  const known = new Set(
    (
      await db
        .select({ postId: schema.insights.postId })
        .from(schema.insights)
        .where(and(eq(schema.insights.kind, "competitor_spike"), inArray(schema.insights.postId, recent.map((p) => p.id))))
    ).map((r) => r.postId),
  );
  let found = 0;
  for (const post of recent) {
    if (known.has(post.id)) continue;
    const spike = isSpike(post, posts);
    if (!spike) continue;
    found++;
    await db.insert(schema.insights).values({
      kind: "competitor_spike",
      clientId: account.clientId,
      postId: post.id,
      data: { username: account.username, ratio: Math.round(spike.ratio * 10) / 10 },
    });
    await notifyTeam({
      title: `پست @${account.username} گرفت: ${Math.round(spike.ratio)} برابر معمول`,
      body: post.caption?.slice(0, 120) ?? undefined,
      href: `/growth/${account.clientId}#competitors`,
    });
  }
  return found;
}

export async function syncAll(): Promise<SyncResult[]> {
  const accounts = await db.select().from(schema.igAccounts).orderBy(asc(schema.igAccounts.kind));
  const results: SyncResult[] = [];
  // One page at a time keeps well inside Instagram's rate limits
  for (const account of accounts) {
    if (account.kind === "own" && !account.accessToken) continue;
    results.push(await syncAccount(account));
  }
  return results;
}
