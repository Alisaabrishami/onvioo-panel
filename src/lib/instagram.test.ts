import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCompetitor, fetchRecentMedia, normalizeUsername, toMedia } from "./instagram";

afterEach(() => vi.unstubAllGlobals());

describe("instagram", () => {
  it("maps media types and insights", () => {
    const m = toMedia({
      id: "1",
      media_type: "VIDEO",
      media_product_type: "REELS",
      timestamp: "2026-10-01T10:00:00+0000",
      like_count: 5,
      insights: { data: [{ name: "views", values: [{ value: 900 }] }, { name: "saved", total_value: { value: 7 } }] },
    });
    expect(m).toMatchObject({ type: "reel", views: 900, saves: 7, likes: 5, comments: null, reach: null });
    expect(toMedia({ id: "2", media_type: "CAROUSEL_ALBUM", timestamp: "2026-10-01T10:00:00Z" }).type).toBe("carousel");
  });

  it("normalizes usernames and links", () => {
    expect(normalizeUsername("@Cafe.Sample")).toBe("cafe.sample");
    expect(normalizeUsername("https://www.instagram.com/cafe_x/?hl=fa")).toBe("cafe_x");
    expect(normalizeUsername("bad name")).toBeNull();
  });

  it("calls the Graph API with the token and surfaces its errors", async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith("/media")) return Response.json({ data: [{ id: "9", timestamp: "2026-10-01T00:00:00Z" }] });
      return Response.json({ error: { message: "Invalid OAuth access token" } }, { status: 400 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const media = await fetchRecentMedia("123", "tok");
    expect(media[0].externalId).toBe("9");
    const called = fetchMock.mock.calls[0][0] as URL;
    expect(called.searchParams.get("access_token")).toBe("tok");
    expect(called.pathname).toBe("/v23.0/123/media");
    await expect(fetchCompetitor("123", "tok", "rival")).rejects.toThrow("Invalid OAuth access token");
  });
});
