import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "onvioo_session";
const PUBLIC_PATHS = ["/login"];

// Optimistic check only: the cookie's presence. Every page and action
// still verifies the session against the database.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!isPublic && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|sw.js|.*\\.(?:png|svg|jpg|webp|woff2)$).*)",
  ],
};
