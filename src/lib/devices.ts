// A short Persian label for a User-Agent, e.g. "Chrome روی Windows".
// Rough on purpose: it only has to tell a person's devices apart.
export function describeAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /okhttp|Dart|CFNetwork|Expo|ReactNative/i.test(ua)
              ? "اپ"
              : null;
  if (browser && os) return `${browser} روی ${os}`;
  return browser ?? os;
}
