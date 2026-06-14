import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth";

const PUBLIC_EXACT = new Set(["/enter", "/contact", "/privacy", "/terms"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (/^\/session\/[^/]+\/listen\/?$/.test(pathname)) return true;
  if (/^\/session\/[^/]+\/audio-out\/?$/.test(pathname)) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = request.cookies.get(ACCESS_COOKIE)?.value === "1";

  // Never serve HTML at / — always redirect (fixes stale CDN cache of old dashboard)
  if (pathname === "/") {
    const dest = authed ? "/app" : "/enter";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (authed) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/enter";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
