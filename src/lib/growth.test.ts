import { describe, expect, it } from "vitest";
import {
  addDays,
  bestSlots,
  buildForecast,
  followerChange,
  isSpike,
  mapHeader,
  parseCount,
  parseCsv,
  parseDateTime,
  parseDay,
  parseType,
  project,
  type DayPoint,
  type PostMetrics,
} from "./growth";

function daily(start: string, days: number, base: number, perDay: number): DayPoint[] {
  return Array.from({ length: days }, (_, i) => ({ day: addDays(start, i), followers: base + perDay * i }));
}

describe("followerChange", () => {
  it("compares with the snapshot a week earlier", () => {
    expect(followerChange(daily("2026-09-01", 30, 1000, 10), 7)).toBe(70);
  });
  it("falls back to the oldest snapshot and needs two points", () => {
    expect(followerChange(daily("2026-09-01", 3, 1000, 5), 30)).toBe(10);
    expect(followerChange(daily("2026-09-01", 1, 1000, 5), 7)).toBeNull();
  });
});

describe("buildForecast", () => {
  it("needs two weeks of history", () => {
    expect(buildForecast(daily("2026-09-01", 10, 1000, 10), [])).toBeNull();
  });

  it("projects the daily trend", () => {
    const f = buildForecast(daily("2026-07-01", 60, 1000, 10), [])!;
    expect(f.perDay).toBeCloseTo(10);
    expect(project(f, 90)).toBe(1590 + 900);
    expect(f.perReel).toBeNull();
  });

  it("learns how extra reels moved weekly growth", () => {
    // Weeks alternate 1 and 3 reels; each reel adds 50 followers on top of 70 a week
    const points: DayPoint[] = [];
    const reels: string[] = [];
    let followers = 1000;
    const start = "2026-06-01";
    for (let w = 0; w < 8; w++) {
      const n = w % 2 ? 3 : 1;
      for (let d = 0; d < 7; d++) {
        const day = addDays(start, w * 7 + d);
        if (d < n) reels.push(day);
        followers += 10 + (d < n ? 50 : 0);
        points.push({ day, followers });
      }
    }
    const f = buildForecast(points, reels)!;
    expect(f.perReel).not.toBeNull();
    expect(f.perReel!).toBeGreaterThan(40);
    expect(project(f, 28, 2)).toBeGreaterThan(project(f, 28));
  });
});

describe("isSpike", () => {
  const post = (views: number): PostMetrics => ({ postedAt: new Date(), type: "reel", views, likes: 0, comments: 0 });
  it("flags a post far above the page median", () => {
    const posts = [post(1000), post(1200), post(900), post(1100), post(1000), post(5000)];
    expect(isSpike(posts[5], posts)?.ratio).toBeCloseTo(5);
    expect(isSpike(posts[0], posts)).toBeNull();
  });
  it("uses interactions when views are missing and needs a baseline", () => {
    const like = (likes: number): PostMetrics => ({ postedAt: new Date(), type: "post", views: null, likes, comments: 0 });
    const few = [like(10), like(100)];
    expect(isSpike(few[1], few)).toBeNull();
    const many = [like(10), like(12), like(9), like(11), like(10), like(60)];
    expect(isSpike(many[5], many)).not.toBeNull();
  });
});

describe("bestSlots", () => {
  it("groups by Tehran time", () => {
    const at = (iso: string, views: number): PostMetrics => ({ postedAt: new Date(iso), type: "reel", views, likes: 0, comments: 0 });
    // 17:30 UTC = 21:00 Tehran (night); 06:30 UTC = 10:00 Tehran (morning)
    const { hours } = bestSlots([at("2026-10-01T17:30:00Z", 5000), at("2026-10-02T06:30:00Z", 1000)]);
    expect(hours[0].label).toContain("شب");
    expect(hours[1].label).toContain("صبح");
  });
});

describe("CSV import helpers", () => {
  it("parses quoted cells, tabs and BOM", () => {
    expect(parseCsv('﻿date,caption\n2026-10-01,"hi, ""there"""\r\n\n')).toEqual([
      ["date", "caption"],
      ["2026-10-01", 'hi, "there"'],
    ]);
    expect(parseCsv("a\tb")).toEqual([["a", "b"]]);
  });
  it("reads Persian and abbreviated counts", () => {
    expect(parseCount("۱۲٬۳۴۵")).toBe(12345);
    expect(parseCount("12.3K")).toBe(12300);
    expect(parseCount("")).toBeNull();
    expect(parseCount("abc")).toBeNaN();
  });
  it("reads Gregorian and Jalali dates", () => {
    expect(parseDay("2026/10/1")).toBe("2026-10-01");
    expect(parseDay("۱۴۰۵/۰۷/۲۷")).toBe("2026-10-19");
    expect(parseDay("nope")).toBeNull();
  });
  it("reads Meta Business Suite dates and times as Tehran time", () => {
    const r = parseDateTime("10/19/2026 21:00")!;
    expect(r.day).toBe("2026-10-19");
    expect(r.at?.toISOString()).toBe("2026-10-19T17:30:00.000Z");
    expect(parseDateTime("2026-10-19")?.at).toBeNull();
  });
  it("maps Business Suite export headers", () => {
    const m = mapHeader(["Post ID", "Account username", "Description", "Publish time", "Permalink", "Post type", "Views", "Reach", "Likes", "Shares", "Comments", "Saves"]);
    expect(m).toMatchObject({ caption: 2, date: 3, link: 4, type: 5, views: 6, reach: 7, likes: 8, shares: 9, comments: 10, saves: 11 });
  });
  it("maps English and Persian headers", () => {
    expect(mapHeader(["تاریخ", "Followers", "بازدید"])).toEqual({ date: 0, followers: 1, views: 2 });
    expect(parseType("Reels")).toBe("reel");
    expect(parseType("IG reel")).toBe("reel");
    expect(parseType("?")).toBe("post");
  });
});
