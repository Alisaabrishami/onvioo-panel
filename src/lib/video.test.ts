import { describe, expect, it } from "vitest";
import { cleanClipIdeas, fitFrame, normalizeSegments, sliceSegments, toAss, toSrt, toVtt, wrapLine } from "./video";

const segs = [
  { start: 0, end: 2.5, text: "سلام به همه" },
  { start: 2.5, end: 6, text: "امروز منوی تازه را نشان می‌دهیم" },
  { start: 6, end: 12.25, text: "این قهوه مخصوص ماست" },
  { start: 12.25, end: 20, text: "تا آخر ماه تخفیف داریم" },
];

describe("subtitle files", () => {
  it("writes SRT and VTT timestamps", () => {
    expect(toSrt(segs.slice(0, 1))).toBe("1\n00:00:00,000 --> 00:00:02,500\nسلام به همه\n");
    expect(toVtt([{ start: 61.2, end: 3725.05, text: "x" }])).toContain("00:01:01.200 --> 01:02:05.050");
  });

  it("writes ASS events in centiseconds with the Vazirmatn style", () => {
    const ass = toAss(segs.slice(2, 3), 1080, 1920);
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Style: Default,Vazirmatn,");
    expect(ass).toContain("Dialogue: 0,0:00:06.00,0:00:12.25,Default,,0,0,0,,این قهوه مخصوص ماست");
  });

  it("wraps long lines near the middle and strips override braces", () => {
    expect(wrapLine("کوتاه")).toBe("کوتاه");
    const long = "این یک جمله خیلی طولانی است که روی صفحه گوشی جا نمی‌شود";
    expect(wrapLine(long).split("\\N")).toHaveLength(2);
    expect(toAss([{ start: 0, end: 1, text: "{\\b1}سلام" }], 100, 100)).toContain(",,＼b1سلام");
  });
});

describe("segments", () => {
  it("drops empty and backwards lines and sorts", () => {
    expect(normalizeSegments([{ start: 5, end: 6, text: " دو  " }, { start: 1, end: 1, text: "x" }, { start: 0, end: 1, text: "یک" }, { start: 2, end: 3, text: " " }])).toEqual([
      { start: 0, end: 1, text: "یک" },
      { start: 5, end: 6, text: "دو" },
    ]);
  });

  it("slices lines into a clip's own timeline", () => {
    expect(sliceSegments(segs, 2.5, 12.25)).toEqual([
      { start: 0, end: 3.5, text: "امروز منوی تازه را نشان می‌دهیم" },
      { start: 3.5, end: 9.75, text: "این قهوه مخصوص ماست" },
    ]);
  });
});

describe("clip ideas", () => {
  const idea = (start: number, end: number, score: number) => ({ start, end, score, title: "t", hook: "h", reason: "r" });

  it("snaps to line boundaries, keeps length limits, drops overlaps, best first", () => {
    const out = cleanClipIdeas([idea(0.3, 11.9, 6), idea(2.4, 19.5, 9), idea(0, 3, 10), idea(0, 200, 5)], segs, 20);
    expect(out).toEqual([{ ...idea(2.5, 20, 9) }]);
  });
});

describe("frame", () => {
  it("keeps even sizes and caps the short side at 1080", () => {
    expect(fitFrame(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(fitFrame(721, 1281)).toEqual({ width: 722, height: 1282 });
  });
});
