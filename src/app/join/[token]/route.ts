/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { resolveInvitation } from "@/lib/invitations/invitation-service";
import { hasRegistration, joinEventSeries } from "@/lib/registration/registration-service";
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
 * A student who already holds a registration for the series is taken straight to it, whatever the
 * link's own class says (Q13): a link only ever leads somewhere, and never moves what it finds
 * there. Only a student who holds none yet has anything left for the class or the window to
 * decide, and a live link to a closed class tells them so by name (US-45) — as does a link that
 * never led anywhere at all, which says so rather than reading like a student with nothing joined.
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

  const resolution = await resolveInvitation(token);

  if (user.accountType === "teacher") {
    return to(
      resolution.status === "dead"
        ? ROUTES.appRoot
        : eventSeriesRoutes(resolution.invitation.eventSeriesId).registrations,
    );
  }

  if (resolution.status === "dead") {
    return to(`${ROUTES.myRegistration}?invalid=1`);
  }

  const { eventSeriesId, class: className } = resolution.invitation;

  // Holding one already answers where they land; the link decides nothing further for them
  // (Q13, US-45).
  if (await hasRegistration(eventSeriesId, user.uid)) {
    return to(`${ROUTES.myRegistration}/${eventSeriesId}`);
  }

  // The address is still good and only the window is shut — told apart from a dead link so a
  // student is not sent looking for a new one they do not need (US-45).
  if (resolution.status === "closed") {
    return to(`${ROUTES.myRegistration}/${eventSeriesId}?closed=1`);
  }

  try {
    // The uid is the registration's id, so following the link enrols the account that followed
    // it rather than whatever address its token happens to carry (US-31).
    await joinEventSeries(eventSeriesId, user.uid, className);
  } catch {
    return to(ROUTES.myRegistration);
  }

  return to(`${ROUTES.myRegistration}/${eventSeriesId}`);
}
