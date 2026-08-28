/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/**
 * The link a class is invited with (US-23). It carries the token and nothing else — not the
 * series, not the class — so holding one says nothing about any other.
 *
 * Absolute, because it is pasted into a mail and encoded in a QR code: both are read somewhere
 * this tab's address bar cannot be consulted from.
 */
export function invitationLink(token: string, origin = window.location.origin): string {
  return `${origin}/join/${encodeURIComponent(token)}`;
}

/**
 * What the link is called wherever a teacher is offered one. A bare "Link" on a class card says
 * nothing about where it leads, and a card carries several controls that could each own one.
 */
export const INVITATION_LINK_LABEL = "Schüler:innen-Anmeldelink";

/** The same invitation, offered as something to scan rather than something to send. */
export const INVITATION_QR_LABEL = "Anmelde-QR-Code";
