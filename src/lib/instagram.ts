import type { ContentType } from "@/db/schema";

// Instagram Graph API (Business/Creator accounts linked to a Facebook page).
// From servers in Iran set IG_GRAPH_BASE to the foreign relay.
function base(): string {
  return (process.env.IG_GRAPH_BASE ?? "https://graph.facebook.com/v23.0").replace(/\/$/, "");
}

export type IgProfile = { followers: number; mediaCount: number };
export type IgMedia = {
  externalId: string;
  permalink: string | null;
  type: ContentType;
  caption: string | null;
  postedAt: Date;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
};

export class IgError extends Error {}

async function graph<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const url = new URL(`${base()}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || body.error) throw new IgError(body.error?.message ?? `Instagram responded ${res.status}`);
  return body;
}

type RawMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  insights?: { data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
};

export function mediaType(m: Pick<RawMedia, "media_type" | "media_product_type">): ContentType {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_product_type === "STORY") return "story";
  if (m.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (m.media_type === "VIDEO") return "video";
  return "post";
}

export function toMedia(m: RawMedia): IgMedia {
  const metric = (name: string) => {
    const d = m.insights?.data.find((x) => x.name === name);
    return d ? (d.total_value?.value ?? d.values?.[0]?.value ?? null) : null;
  };
  return {
    externalId: m.id,
    permalink: m.permalink ?? null,
    type: mediaType(m),
    caption: m.caption ?? null,
    postedAt: new Date(m.timestamp),
    views: metric("views"),
    reach: metric("reach"),
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    saves: metric("saved"),
    shares: metric("shares"),
  };
}

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";

export async function fetchProfile(igUserId: string, token: string): Promise<IgProfile> {
  const p = await graph<{ followers_count: number; media_count: number }>(igUserId, { fields: "followers_count,media_count" }, token);
  return { followers: p.followers_count, mediaCount: p.media_count };
}

// Yesterday's page reach and views
export async function fetchDailyInsights(igUserId: string, token: string): Promise<{ reach: number | null; views: number | null }> {
  const r = await graph<{ data: { name: string; total_value?: { value: number } }[] }>(
    `${igUserId}/insights`,
    { metric: "reach,views", period: "day", metric_type: "total_value" },
    token,
  );
  const get = (name: string) => r.data.find((d) => d.name === name)?.total_value?.value ?? null;
  return { reach: get("reach"), views: get("views") };
}

export async function fetchRecentMedia(igUserId: string, token: string, limit = 30): Promise<IgMedia[]> {
  const r = await graph<{ data: RawMedia[] }>(
    `${igUserId}/media`,
    { fields: `${MEDIA_FIELDS},insights.metric(views,reach,saved,shares)`, limit: String(limit) },
    token,
  );
  return r.data.map(toMedia);
}

// Public numbers of another Business/Creator page, looked up through one of ours
export async function fetchCompetitor(
  igUserId: string,
  token: string,
  username: string,
): Promise<IgProfile & { media: IgMedia[] }> {
  const r = await graph<{
    business_discovery: { followers_count: number; media_count: number; media?: { data: RawMedia[] } };
  }>(
    igUserId,
    { fields: `business_discovery.username(${username}){followers_count,media_count,media.limit(30){${MEDIA_FIELDS}}}` },
    token,
  );
  const b = r.business_discovery;
  return { followers: b.followers_count, mediaCount: b.media_count, media: (b.media?.data ?? []).map(toMedia) };
}

// "@cafe.sample", "instagram.com/cafe.sample/" → "cafe.sample"
export function normalizeUsername(input: string): string | null {
  const t = input
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(t) ? t : null;
}
