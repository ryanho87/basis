import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up", "/privacy", "/terms"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const remoteMcpPath = pathname === "/api/mcp" || pathname === "/oauth/authorize" || pathname.startsWith("/.well-known/oauth-protected-resource");
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/auth/") || remoteMcpPath) {
    return NextResponse.next();
  }

  // This is an optimistic edge check only. Every financial query performs a
  // full database-backed session and ownership check in the server DAL.
  if (getSessionCookie(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const signIn = new URL("/sign-in", request.url);
  if (pathname !== "/") signIn.searchParams.set("next", pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
