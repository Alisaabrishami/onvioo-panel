import { describe, expect, it } from "vitest";
import { type DigestTask, askReason, digestText, groupForDigest, inWorkingHours, questionText } from "./follow-up";

// Tehran is UTC+3:30, so 06:30Z is 10:00 there
const at = (iso: string) => new Date(iso);
const base = { title: "طراحی کاور", dueAt: null, createdAt: at("2026-10-20T06:30:00Z"), followUpEvery: 1, askedAt: null, answeredAt: null };

describe("follow-up timing", () => {
  it("asks only in working hours and never on Friday", () => {
    expect(inWorkingHours(at("2026-10-26T06:30:00Z"))).toBe(true); // Monday 10:00
    expect(inWorkingHours(at("2026-10-26T04:00:00Z"))).toBe(false); // 07:30
    expect(inWorkingHours(at("2026-10-26T15:45:00Z"))).toBe(false); // 19:15
    expect(inWorkingHours(at("2026-10-30T06:30:00Z"))).toBe(false); // Friday
  });

  it("asks at most once a Tehran day", () => {
    const now = at("2026-10-26T10:00:00Z");
    expect(askReason({ ...base, askedAt: at("2026-10-26T06:00:00Z") }, now)).toBeNull();
    expect(askReason({ ...base, answeredAt: at("2026-10-26T07:00:00Z") }, now)).toBeNull();
    expect(askReason({ ...base, askedAt: at("2026-10-25T12:00:00Z") }, now)).toBe("checkin");
  });

  it("follows the deadline closely", () => {
    const now = at("2026-10-26T06:30:00Z");
    expect(askReason({ ...base, dueAt: at("2026-10-25T15:00:00Z") }, now)).toBe("overdue");
    expect(askReason({ ...base, dueAt: at("2026-10-26T15:00:00Z") }, now)).toBe("due_today");
    expect(askReason({ ...base, dueAt: at("2026-10-27T15:00:00Z") }, now)).toBe("due_tomorrow");
  });

  it("waits the chosen number of days between check-ins", () => {
    const now = at("2026-10-26T06:30:00Z");
    const task = { ...base, followUpEvery: 3, dueAt: at("2026-11-20T06:30:00Z") };
    expect(askReason({ ...task, askedAt: at("2026-10-24T06:30:00Z") }, now)).toBeNull();
    expect(askReason({ ...task, askedAt: at("2026-10-23T06:30:00Z") }, now)).toBe("checkin");
    expect(askReason({ ...task, askedAt: at("2026-10-23T06:30:00Z"), answeredAt: at("2026-10-25T06:30:00Z") }, now)).toBeNull();
  });

  it("speaks for the manager in the question", () => {
    const text = questionText("علی", [{ title: "تدوین ریل", dueAt: null, reason: "overdue" }]);
    expect(text).toContain("از طرف علی");
    expect(text).toContain("۱. تدوین ریل · ⚠️ مهلتش گذشته است");
  });
});

describe("manager digest", () => {
  const now = at("2026-10-26T06:30:00Z");
  const since = at("2026-10-25T06:30:00Z");
  const t = (over: Partial<DigestTask>): DigestTask => ({
    title: "کار",
    assignee: "سارا",
    dueAt: null,
    status: "doing",
    checkin: "on_track",
    checkinNote: null,
    unanswered: 0,
    completedAt: null,
    ...over,
  });

  it("puts each task in the most urgent group", () => {
    const g = groupForDigest(
      [
        t({ title: "الف", checkin: "blocked", checkinNote: "فایل خام نرسیده", dueAt: at("2026-10-20T00:00:00Z") }),
        t({ title: "ب", checkin: "asked", unanswered: 2 }),
        t({ title: "ج", dueAt: at("2026-10-25T00:00:00Z") }),
        t({ title: "د" }),
        t({ title: "ه", status: "done", completedAt: at("2026-10-25T20:00:00Z") }),
        t({ title: "و", status: "done", completedAt: at("2026-10-20T20:00:00Z") }),
      ],
      now,
      since,
    );
    expect([g.blocked, g.silent, g.late, g.onTrack, g.done].map((l) => l.map((x) => x.title))).toEqual([["الف"], ["ب"], ["ج"], ["د"], ["ه"]]);
    const text = digestText(g);
    expect(text).toContain("الف (سارا) — «فایل خام نرسیده»");
    expect(text).toContain("۲ بار پرسیدم");
  });
});
