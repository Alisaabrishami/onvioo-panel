import { describe, expect, it } from "vitest";
import { autoTaskFor, isOverdue } from "./content";

describe("autoTaskFor", () => {
  it("opens an edit task when footage arrives", () => {
    expect(autoTaskFor("editing", "shot", "منوی پاییز")).toEqual({ key: "stage:editing", title: "تدوین: منوی پاییز" });
  });

  it("calls it a revision when review sends content back", () => {
    expect(autoTaskFor("editing", "client_review", "منوی پاییز")?.title).toBe("اعمال اصلاحات: منوی پاییز");
    expect(autoTaskFor("editing", "internal_review", "منوی پاییز")?.title).toBe("اعمال اصلاحات: منوی پاییز");
  });

  it("opens review and publish tasks, and none for stages the team waits on", () => {
    expect(autoTaskFor("internal_review", "editing", "x")?.key).toBe("stage:internal_review");
    expect(autoTaskFor("ready", "client_review", "x")?.title).toBe("انتشار: x");
    expect(autoTaskFor("client_review", "internal_review", "x")).toBeNull();
    expect(autoTaskFor("published", "ready", "x")).toBeNull();
    expect(autoTaskFor("idea", null, "x")).toBeNull();
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it("compares against now and ignores missing deadlines", () => {
    expect(isOverdue(new Date("2026-10-19T11:59:00Z"), now)).toBe(true);
    expect(isOverdue(new Date("2026-10-19T12:01:00Z"), now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
});
