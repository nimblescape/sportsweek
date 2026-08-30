/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { resolveInvitation } from "@/lib/invitations/invitation-service";
import { joinEventSeries } from "@/lib/registration/registration-service";
import { ROUTES, eventSeriesRoutes } from "@/lib/routes";

/**
 * The invitation link (US-23). It selects an event series and does nothing else: it signs nobody
 * in and grants no identity, so a student following it still signs in through Entra ID and still
 * has the role their address's domain gives them (US-1, US-3).
 *
 * Following it is what joins a student, so this writes the registration rather than noting the
 * token down to be redeemed later. That needs to know who is joining, and a signed-out visitor
 * is the ordinary case — the link is followed before signing in — so they are sent to sign in
 * and back here, and the joining happens on the second pass. Nothing crosses that round trip but
 * the address itself.
 *
 * A teacher who follows one is taken to the dashboard scoped to the series it names (Q12): the
 * commonest teacher to follow a link is the one who made it, checking it before sending it out,
 * and a refusal would be a message for somebody who has done nothing wrong.
 *
 * It refuses nothing and says nothing. Every reason a link can lead nowhere — mistyped,
 * superseded, naming a series since closed — is answered by the one sentence on the landing
 * page, so that none of them can be told apart, and a joining the server declines reads the same.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const user = await getAuthenticatedUser();

  // A relative Location, which the browser resolves against the address it asked for. An absolute
  // one would have to name a host, and the only address a Route Handler can see behind a proxy is
  // the container's own -- `request.url` here reads http://0.0.0.0:8080. Taking the host from a
  // forwarded header instead would name it correctly and let a caller choose the destination.
  const to = (destination: string) =>
    new NextResponse(null, { status: 307, headers: { Location: destination } });

  if (user === null) {
    const query = new URLSearchParams({ next: `/join/${token}` });
    return to(`${ROUTES.signIn}?${query}`);
  }

  const invitation = await resolveInvitation(token);

  if (user.accountType === "teacher") {
    return to(
      invitation ? eventSeriesRoutes(invitation.eventSeriesId).registrations : ROUTES.appRoot,
    );
  }

  if (invitation === null) return to(ROUTES.myRegistration);

  try {
    // Lower-cased because a UPN is the registration's id, and the directory does not agree with
    // itself about case; every other read of it is lower-cased for the same reason.
    await joinEventSeries(invitation.eventSeriesId, (user.email ?? "").toLowerCase(), invitation.class); // prettier-ignore
  } catch {
    return to(ROUTES.myRegistration);
  }

  return to(`${ROUTES.myRegistration}/${invitation.eventSeriesId}`);
}
