import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionJwt } from "@/lib/authShared";

/**
 * Route-level auth gate (Next 16's middleware, renamed proxy). Every page
 * request needs a valid session cookie once auth is configured; before the
 * env vars exist this passes everything through so the app stays usable
 * during setup. Server actions in app/actions/sheets.ts re-check the
 * session themselves — this layer is the UX redirect, not the only lock.
 */

// Mirrors authConfigured() in lib/server/auth.ts, which proxy can't import
// (that module is marked "server-only" and pulls in next/headers).
function authConfigured(): boolean {
  return !!(process.env.AUTH_SECRET && process.env.FIREBASE_API_KEY);
}

export async function proxy(request: NextRequest) {
  if (!authConfigured()) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionJwt(token, process.env.AUTH_SECRET!) : null;
  const isLogin = request.nextUrl.pathname === "/login";

  if (!session && !isLogin) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") {
      url.searchParams.set("next", request.nextUrl.pathname);
    }
    return NextResponse.redirect(url);
  }
  if (session && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|favicon\\.ico|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|webmanifest)).*)",
  ],
};
