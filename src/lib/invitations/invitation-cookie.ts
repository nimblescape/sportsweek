/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { cookies } from "next/headers";

export const INVITATION_COOKIE_NAME = "sportsweek_invitation";

/**
 * Long enough to survive signing in through Entra ID and filling the form in, short enough that
 * a shared browser does not go on enrolling whoever sits down at it next. It is deliberately not
 * a session that outlives the joining: the link is needed once (US-23), and afterwards a student
 * reaches their registration by signing in.
 */
export const INVITATION_COOKIE_MAX_AGE_SECONDS = 60 * 60;

/**
 * The token of the link the student arrived through, if they arrived through one.
 *
 * It is held in a cookie rather than in the URL because the link is followed before signing in:
 * the round trip through the identity provider comes back to `/app`, and a token carried in the
 * address would not survive it. httpOnly, because nothing in the browser has any use for it.
 */
export async function invitationTokenFromCookie(): Promise<string | null> {
  return (await cookies()).get(INVITATION_COOKIE_NAME)?.value ?? null;
}
