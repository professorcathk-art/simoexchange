import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth";

const PUBLIC_EXACT = new Set(["/", "/contact", "/privacy", "/terms"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname === "/favicon.ico") return true;
  if (/^\/session\/[^/]+\/listen\/?$/.test(pathname)) return true;
  if (/^\/session\/[^/]+\/audio-out\/?$/.test(pathname)) return true;
  return false;
}

function noCache(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = request.cookies.get(ACCESS_COOKIE)?.value === "1";

  // Logged-in users visiting / go straight to the dashboard
  if (pathname === "/" && authed) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  if (isPublicPath(pathname)) {
    if (pathname === "/") return noCache(NextResponse.next());
    return NextResponse.next();
  }

  if (authed) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
