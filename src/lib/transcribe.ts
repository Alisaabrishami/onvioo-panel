import "server-only";
import { readFile } from "node:fs/promises";
import type { Segment } from "@/db/schema";

// Speech to text through any OpenAI-compatible Whisper endpoint
// (/v1/audio/transcriptions with verbose_json). A self-hosted Whisper server
// on the panel's own machine works from Iran with no foreign payment.
// WHISPER_DRIVER=mock returns timed placeholder lines for development.

export class TranscribeUnavailableError extends Error {}

export function transcribeConfigured(): boolean {
  return process.env.WHISPER_DRIVER === "mock" || !!process.env.WHISPER_URL;
}

const MOCK_LINES = [
  "سلام به همه، امروز می‌خوایم یه چیز جدید نشونتون بدیم",
  "این منوی تازه‌ی ماست که از این هفته شروع شده",
  "اول از همه این قهوه‌ی مخصوص رو امتحان کنید",
  "دونه‌هاش رو خودمون هر روز صبح برشته می‌کنیم",
  "یه نکته‌ی مهم: تا آخر ماه همه‌ی نوشیدنی‌ها با تخفیفه",
  "اگه دوست داشتید حتماً پیج ما رو دنبال کنید",
];

export async function transcribeAudio(audioPath: string, duration: number): Promise<Segment[]> {
  if (process.env.WHISPER_DRIVER === "mock") {
    const step = Math.max(1.5, Math.min(4, duration / MOCK_LINES.length));
    const out: Segment[] = [];
    for (let t = 0, i = 0; t + 0.5 < duration; t += step, i++) {
      out.push({ start: t, end: Math.min(duration, t + step - 0.2), text: MOCK_LINES[i % MOCK_LINES.length] });
    }
    return out;
  }
  const base = process.env.WHISPER_URL?.replace(/\/$/, "");
  if (!base) throw new TranscribeUnavailableError("WHISPER_URL is not set");

  const form = new FormData();
  form.append("file", new Blob([await readFile(audioPath)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", process.env.WHISPER_MODEL ?? "whisper-1");
  form.append("language", "fa");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch(`${base}/v1/audio/transcriptions`, {
    method: "POST",
    headers: process.env.WHISPER_API_KEY ? { authorization: `Bearer ${process.env.WHISPER_API_KEY}` } : {},
    body: form,
    signal: AbortSignal.timeout(60 * 60_000),
  });
  if (!res.ok) throw new Error(`Whisper responded ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const body = (await res.json()) as { segments?: { start: number; end: number; text: string }[]; text?: string };
  if (body.segments?.length) return body.segments.map((s) => ({ start: s.start, end: s.end, text: s.text }));
  // Servers that ignore verbose_json send only the text: one line for the whole video
  return body.text?.trim() ? [{ start: 0, end: duration, text: body.text.trim() }] : [];
}
