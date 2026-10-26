import { describe, expect, it } from "vitest";
import { allowed, callback, formatDuration, menuFor, normalizeCode, parseCommand, shorten, timecodeIn, MENU_LABELS } from "./bot-text";
import { basicSummary, countByType, instagramTotals, uptimePercent, type MonthlyStats } from "./monthly";

describe("bot commands", () => {
  it("reads slash commands, bot mentions and menu buttons", () => {
    expect(parseCommand("/tasks")).toEqual({ command: "tasks", arg: "" });
    expect(parseCommand("/start ABCD234567")).toEqual({ command: "help", arg: "ABCD234567" });
    expect(parseCommand("/in@onvioo_bot")).toEqual({ command: "clockin", arg: "" });
    expect(parseCommand(MENU_LABELS.review)).toEqual({ command: "review", arg: "" });
    expect(parseCommand("انصراف")?.command).toBe("cancel");
    expect(parseCommand("/unknown")).toBeNull();
    expect(parseCommand("سلام")).toBeNull();
  });

  it("keeps team and client commands apart", () => {
    expect(allowed("staff", "tasks")).toBe(true);
    expect(allowed("client", "tasks")).toBe(false);
    expect(allowed("client", "review")).toBe(true);
    expect(allowed("admin", "invoices")).toBe(false);
    expect(allowed("client", "help")).toBe(true);
    expect(menuFor("client").flat()).toContain(MENU_LABELS.invoices);
    expect(menuFor("staff").flat()).toContain(MENU_LABELS.clockin);
  });

  it("accepts connect codes typed loosely and rejects anything else", () => {
    expect(normalizeCode(" abcd-efgh 23 ")).toBe("ABCDEFGH23");
    expect(normalizeCode("ABCD")).toBeNull();
    expect(normalizeCode("سلام خوبی")).toBeNull();
  });

  it("formats callback data, durations and long titles", () => {
    expect(callback("td:1234")).toEqual({ verb: "td", id: "1234" });
    expect(callback("nonsense")).toBeNull();
    expect(formatDuration(45)).toBe("۴۵ دقیقه");
    expect(formatDuration(120)).toBe("۲ ساعت");
    expect(formatDuration(135)).toBe("۲ ساعت و ۱۵ دقیقه");
    expect(shorten("یک عنوان خیلی خیلی طولانی برای یک کار", 10)).toHaveLength(10);
  });

  it("finds the first timecode in a change request, Persian digits included", () => {
    expect(timecodeIn("ثانیه ۰:۱۵ لوگو کوچک است")).toBe(15);
    expect(timecodeIn("at 1:05 and 2:00")).toBe(65);
    expect(timecodeIn("ساعت 14:300")).toBeNull();
    expect(timecodeIn("رنگ را عوض کنید")).toBeNull();
  });
});

describe("monthly report", () => {
  it("sums Instagram days and ignores days without a follower count", () => {
    const t = instagramTotals([
      { day: "2026-10-03", followers: 1200, views: 50, reach: 40 },
      { day: "2026-10-01", followers: 1000, views: 100, reach: null },
      { day: "2026-10-02", followers: null, views: 25, reach: 10 },
    ]);
    expect(t).toEqual({ followersStart: 1000, followersEnd: 1200, change: 200, views: 175, reach: 50 });
    expect(instagramTotals([{ day: "2026-10-01", followers: 900 }]).change).toBeNull();
  });

  it("works out uptime and counts by type", () => {
    expect(uptimePercent(999, 1000)).toBe(99.9);
    expect(uptimePercent(0, 0)).toBeNull();
    expect(countByType(["reel", "reel", "story"])).toEqual({ reel: 2, story: 1 });
  });

  it("writes a readable summary without AI", () => {
    const stats: MonthlyStats = {
      content: { published: 3, byType: { reel: 2, story: 1 }, titles: ["الف", "ب", "ج"], approved: 2, revisions: 1, inProgress: 4 },
      shoots: 2,
      instagram: { followersStart: 1000, followersEnd: 1150, change: 150, views: 12000, reach: 9000, posts: 5, topPosts: [] },
      site: { projects: [], milestonesDone: 0, ticketsOpened: 0, ticketsClosed: 0, uptime: null },
      billing: { invoiced: 0, paid: 0, outstanding: 0 },
    };
    const s = basicSummary("کافه نمونه", "1405-07", stats);
    expect(s.headline).toContain("مهر ۱۴۰۵");
    expect(s.highlights.join(" ")).toContain("۱۵۰ فالوور جدید");
    expect(s.summary).toContain("۴ محتوای دیگر");
    expect(s.nextMonth.length).toBeGreaterThan(0);
  });
});
