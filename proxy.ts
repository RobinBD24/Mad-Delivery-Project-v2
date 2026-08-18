import NextAuth from "next-auth";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

import { authConfig } from "@/auth.config";
import { ROLE_HOME, ROUTE_ROLES } from "@/lib/constants";
import type { Role } from "@/types";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/register", "/registration-pending", "/forgot-password"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Lightweight route protection (UX only — every API handler re-enforces its own
 * permissions server-side, which is the real security boundary):
 *  1. Send logged-out users on protected pages to /login.
 *  2. Send logged-in users away from the auth pages to their dashboard.
 *  3. Keep each role inside its own section (super_admin may inspect all).
 */
const protect = auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;
  const role = user?.role as Role | undefined;
  const loggedIn = Boolean(user?.id);

  // "/" is the PUBLIC homepage — never redirect it.
  if (pathname === "/") return NextResponse.next();

  if (!loggedIn && !isPublic(pathname)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (
    loggedIn &&
    (pathname === "/login" ||
      pathname === "/forgot-password" ||
      pathname === "/register" ||
      pathname.startsWith("/register/"))
  ) {
    return NextResponse.redirect(new URL(role ? ROLE_HOME[role] ?? "/login" : "/login", req.url));
  }

  if (loggedIn && role && role !== "super_admin") {
    const match = ROUTE_ROLES.find(
      ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (match && !match[1].includes(role)) {
      return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/login", req.url));
    }
  }

  return NextResponse.next();
});

type NextMiddleware = (
  req: NextRequest,
  ctx: NextFetchEvent,
) => Response | Promise<Response | void> | void;

/**
 * The Auth.js `auth()` wrapper re-issues (rolls) the session cookie on EVERY
 * request it handles, attaching a fresh `Set-Cookie` to the response. That is
 * the real (intermittent) root cause of the logout failure — a genuine auth
 * defect, not a test flake:
 *
 *   1. User clicks Logout → `signOut()` clears the cookie (`Set-Cookie … Max-Age=0`).
 *   2. But the dashboard viewport-prefetches its nav links, so RSC requests to
 *      protected routes are already in flight. Each reaches the server a beat
 *      later still carrying the valid JWT, and `auth()` rolls a fresh cookie
 *      onto its response — RESURRECTING the just-cleared session.
 *   3. The user is silently logged back in; the session cookie never dies.
 *
 * This route middleware exists ONLY to redirect (UX). It must be READ-ONLY with
 * respect to the session cookie: the cookie is legitimately written exactly
 * twice in the app's life — set by the `signIn` server action, cleared by the
 * `signOut` server action — and NEVER by middleware. So we strip any `Set-Cookie`
 * the wrapper tries to add. Redirects/next() and their other headers are left
 * untouched; real security is enforced by `requireRole` + each API handler.
 */
export default async function proxy(req: NextRequest, ctx: NextFetchEvent) {
  const res = await (protect as unknown as NextMiddleware)(req, ctx);
  if (res instanceof Response) res.headers.delete("set-cookie");
  return res ?? NextResponse.next();
}

export const config = {
  // Everything except Next internals, API routes, static assets and files with extensions.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
