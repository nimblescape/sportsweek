/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { readUnverifiedRole } from "@/lib/auth/session-claims";
import { ROUTES, STUDENT_ONLY_PREFIXES, matchesPrefix } from "@/lib/routes";

// Gate everything under /app; Route Handlers/Server Actions still re-check roles themselves.
const PROTECTED_PREFIX = "/app";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith(PROTECTED_PREFIX)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    const signInUrl = new URL(ROUTES.signIn, request.url);
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Optimistic only: the cookie signature is not verified here, so an unreadable claim
  // falls through to the page, which re-checks the role against the verified session.
  const role = readUnverifiedRole(sessionCookie);
  if (!role) {
    return NextResponse.next();
  }

  // The landing route belongs to neither role: it is what decides where each of them goes.
  if (pathname === ROUTES.appRoot) {
    return NextResponse.next();
  }

  const isStudentPage = matchesPrefix(pathname, STUDENT_ONLY_PREFIXES);
  const blocked = isStudentPage ? role !== "student" : role !== "teacher";

  return blocked
    ? NextResponse.redirect(new URL(ROUTES.appRoot, request.url))
    : NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
