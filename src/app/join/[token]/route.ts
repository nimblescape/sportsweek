/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { getUserWithRole } from "@/lib/auth/guards";
import {
  INVITATION_COOKIE_MAX_AGE_SECONDS,
  INVITATION_COOKIE_NAME,
} from "@/lib/invitations/invitation-cookie";
import { resolveInvitation } from "@/lib/invitations/invitation-service";
import { ROUTES, eventSeriesRoutes } from "@/lib/routes";

/**
 * The invitation link (US-23). It selects an event series and does nothing else: it signs nobody
 * in and grants no identity, so a student following it still signs in through Entra ID and still
 * has the role their UPN domain gives them (US-1, US-3).
 *
 * The token is put in a cookie before anything is decided about the caller, because a signed-out
 * visitor is the ordinary case: they are sent to sign in, come back to `/app`, and the cookie is
 * what carries the link across that round trip. It refuses nothing and says nothing — every
 * reason a link can lead nowhere is answered by the one sentence on the landing page, so that
 * none of them can be told apart.
 *
 * A teacher who follows one is taken to the dashboard scoped to the series it names (Q12): the
 * commonest teacher to follow a link is the one who made it, checking it before sending it out,
 * and a refusal would be a message for somebody who has done nothing wrong.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const user = await getUserWithRole();

  const destination = user?.role === "teacher" ? await dashboardFor(token) : ROUTES.myRegistration;

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(INVITATION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: INVITATION_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}

async function dashboardFor(token: string): Promise<string> {
  const invitation = await resolveInvitation(token);
  return invitation ? eventSeriesRoutes(invitation.eventSeriesId).overview : ROUTES.appRoot;
}
