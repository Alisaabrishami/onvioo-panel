// Pure helpers for site monitoring

export type CheckResult = { ok: boolean; status: number | null; ms: number | null; error: string | null };

export function uptime(checks: { ok: boolean }[]): number | null {
  if (checks.length === 0) return null;
  return checks.filter((c) => c.ok).length / checks.length;
}

export function normalizeUrl(input: string): string | null {
  let t = input.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  try {
    const u = new URL(t);
    if (!u.hostname.includes(".") || /\s/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// A site is called down after two failed checks in a row, so one slow answer does not page anyone
export function transition(prevUp: boolean | null, recent: { ok: boolean }[]): "down" | "up" | null {
  const [last, before] = recent;
  if (!last) return null;
  if (last.ok) return prevUp === false ? "up" : null;
  if (prevUp !== false && before && !before.ok) return "down";
  return null;
}

export function daysUntil(date: Date | null, now: Date = new Date()): number | null {
  return date ? Math.floor((date.getTime() - now.getTime()) / 86400000) : null;
}

export function describeError(error: unknown): string {
  const e = error as { name?: string; cause?: { code?: string }; message?: string };
  const code = e?.cause?.code;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "پاسخ نداد (بیش از ۱۵ ثانیه)";
  if (code === "ENOTFOUND") return "دامنه پیدا نشد";
  if (code === "ECONNREFUSED") return "سرور اتصال را رد کرد";
  if (code?.startsWith("CERT_") || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return "گواهی SSL نامعتبر";
  return e?.message?.slice(0, 120) ?? "خطای نامشخص";
}
