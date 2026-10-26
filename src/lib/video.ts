import type { ClipIdea, Segment } from "@/db/schema";

// Pure helpers for subtitles and clips; ffmpeg and storage live in video-jobs.ts

export const VIDEO_JOB_LABELS = { transcribe: "ساختن زیرنویس", burn: "چسباندن زیرنویس روی ویدیو", clip: "برش کلیپ" } as const;
export const JOB_STATUS_LABELS = { queued: "در صف", running: "در حال انجام", done: "انجام شد", failed: "ناموفق" } as const;
export const JOB_STATUS_TONES = { queued: "neutral", running: "info", done: "success", failed: "danger" } as const;

export const CLIP_MIN_SECONDS = 8;
export const CLIP_MAX_SECONDS = 90;

export type SubtitleStyle = { position: "bottom" | "middle"; size: "small" | "medium" | "large" };
export const DEFAULT_STYLE: SubtitleStyle = { position: "bottom", size: "medium" };

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function clock(seconds: number, sep: string, msDigits: 2 | 3): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const frac = Math.round((total - Math.floor(total)) * 10 ** msDigits) % 10 ** msDigits;
  return `${msDigits === 2 ? h : pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(frac, msDigits)}`;
}

// Cleans what Whisper or a person typed: trimmed, ordered, no empty or zero-length lines
export function normalizeSegments(segments: Segment[]): Segment[] {
  return segments
    .map((s) => ({ start: Math.max(0, Number(s.start)), end: Number(s.end), text: s.text.replace(/\s+/g, " ").trim() }))
    .filter((s) => s.text && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

export function toSrt(segments: Segment[]): string {
  return segments.map((s, i) => `${i + 1}\n${clock(s.start, ",", 3)} --> ${clock(s.end, ",", 3)}\n${s.text}\n`).join("\n");
}

export function toVtt(segments: Segment[]): string {
  return `WEBVTT\n\n${segments.map((s) => `${clock(s.start, ".", 3)} --> ${clock(s.end, ".", 3)}\n${s.text}\n`).join("\n")}`;
}

// Breaks a long line in two near the middle, at a space, so it fits a phone screen
export function wrapLine(text: string, max = 38): string {
  if (text.length <= max) return text;
  const mid = Math.floor(text.length / 2);
  let cut = -1;
  for (let d = 0; d < mid; d++) {
    if (text[mid + d] === " ") { cut = mid + d; break; }
    if (text[mid - d] === " ") { cut = mid - d; break; }
  }
  return cut < 0 ? text : `${text.slice(0, cut)}\\N${text.slice(cut + 1)}`;
}

function assEscape(text: string): string {
  return text.replace(/\\/g, "＼").replace(/[{}]/g, "");
}

// Advanced SubStation file for ffmpeg's ass filter: white Vazirmatn text with a
// dark outline, sized for the output frame
export function toAss(segments: Segment[], width: number, height: number, style: SubtitleStyle = DEFAULT_STYLE): string {
  const base = Math.min(width, height);
  const size = Math.round(base * { small: 0.045, medium: 0.058, large: 0.072 }[style.size]);
  const alignment = style.position === "middle" ? 5 : 2;
  const marginV = style.position === "middle" ? 0 : Math.round(height * 0.12);
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Vazirmatn,${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(size / 12))},1,${alignment},${Math.round(width * 0.06)},${Math.round(width * 0.06)},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...segments.map((s) => `Dialogue: 0,${clock(s.start, ".", 2)},${clock(s.end, ".", 2)},Default,,0,0,0,,${wrapLine(assEscape(s.text))}`),
    "",
  ].join("\n");
}

// The lines inside [start, end), moved so the clip starts at zero
export function sliceSegments(segments: Segment[], start: number, end: number): Segment[] {
  return segments
    .filter((s) => s.end > start && s.start < end)
    .map((s) => ({ start: Math.max(0, s.start - start), end: Math.min(end, s.end) - start, text: s.text }));
}

// Keeps Claude's picks honest: inside the video, a sensible length, snapped to
// whole sentences, not overlapping, best first
export function cleanClipIdeas(ideas: ClipIdea[], segments: Segment[], duration: number): ClipIdea[] {
  const starts = segments.map((s) => s.start);
  const ends = segments.map((s) => s.end);
  const snap = (t: number, points: number[]) =>
    points.length ? points.reduce((best, p) => (Math.abs(p - t) < Math.abs(best - t) ? p : best)) : t;
  const out: ClipIdea[] = [];
  for (const idea of [...ideas].sort((a, b) => b.score - a.score)) {
    const start = Math.max(0, snap(idea.start, starts));
    const end = Math.min(duration, snap(idea.end, ends));
    const length = end - start;
    if (length < CLIP_MIN_SECONDS || length > CLIP_MAX_SECONDS) continue;
    if (out.some((o) => start < o.end && end > o.start)) continue;
    out.push({ ...idea, start: round(start), end: round(end), score: Math.min(10, Math.max(1, Math.round(idea.score))) });
  }
  return out.slice(0, 5);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Transcript as numbered, timed lines for a prompt
export function transcriptForPrompt(segments: Segment[]): string {
  return segments.map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`).join("\n");
}

// Fills the 9:16 frame from any source: scale up until it covers, then crop the middle
export function verticalFilter(width = 1080, height = 1920): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
}

// Output frame for burning subtitles in place: even numbers, at most 1080 on the short side
export function fitFrame(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, 1080 / Math.min(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}
