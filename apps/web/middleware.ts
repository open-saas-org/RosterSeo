import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const AUTH_PAGES = ["/login", "/signup"];

// Real, session-less public routes - the page itself is responsible for
// its own auth (a share token, in this case), so this middleware's
// blanket "no session -> /login" redirect must not apply to them, or the
// page component never even gets a chance to check the token. "/docs" is
// the proxied docs app (see next.config.mjs's rewrites) - it's public
// documentation, never gated behind login, same as any product's /docs.
const PUBLIC_PATH_PREFIXES = ["/reports/ai-visibility/", "/docs"];

// Cookie-presence check only, not a real session validation (no DB round
// trip) - fast enough to run on every request. Routes that actually need
// the authenticated user still call auth.api.getSession() themselves
// (see apps/web/lib/api-utils.ts's withAuth) - this middleware only keeps
// signed-out visitors out of the dashboard shell, it's not the security
// boundary.
export function middleware(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const isAuthPage = AUTH_PAGES.some((path) => request.nextUrl.pathname.startsWith(path));
  const isPublicPage = PUBLIC_PATH_PREFIXES.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!hasSession && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Excludes any path with a file extension (public/ static assets - svg
  // logos, favicon, etc.), not just the four hardcoded names - without
  // this, next/image's internal fetch for a local SVG (which doesn't
  // forward the browser's auth cookie) gets redirected to /login and fails
  // with "isn't a valid image" for every user, logged in or not.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
