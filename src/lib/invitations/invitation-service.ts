/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { eventSeriesSchema } from "@/lib/schemas/event-series";
import { invitationSchema, type Invitation } from "@/lib/schemas/invitation";
import { normalizeName } from "@/lib/firebase/name-key";

/**
 * 32 bytes of entropy, base64url so it survives a URL and a QR code unescaped. Guessing is not a
 * strategy against this, which is what lets the token stand in for the series id in a link that
 * tells its holder nothing about any other (US-23).
 */
const TOKEN_BYTES = 32;

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function invitationDoc(token: string) {
  return adminDb.collection(COLLECTIONS.invitations).doc(token);
}

/**
 * Generates a class's link, replacing whichever one it had (US-23). Regenerating invalidates only
 * that class's previous token, and evicts nobody: the students who already used it keep their
 * registrations and reach them by signing in.
 *
 * Handing out a link and opening the series are one intent, so this opens it (US-19). A series
 * that cannot be opened has no link to hand out either, which is why a template and an archived
 * series are refused here rather than at a second control.
 */
export async function createInvitation(
  eventSeriesId: string,
  className: string,
): Promise<Invitation> {
  const token = newToken();

  return adminDb.runTransaction(async (transaction) => {
    const reference = adminDb.collection(COLLECTIONS.eventSeries).doc(eventSeriesId);
    const stored = await transaction.get(reference);
    if (!stored.exists) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Eventreihe gibt es nicht.");
    }

    const series = eventSeriesSchema.parse({ id: stored.id, ...stored.data() });
    if (series.isArchived) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Eine archivierte Eventreihe kann nicht freigeschaltet werden.",
      );
    }
    if (series.isTemplate) {
      throw new ServiceError(
        ErrorCode.Conflict,
        "Eine Vorlage kann nicht für Anmeldungen freigeschaltet werden.",
      );
    }

    // The link names a class the series actually offers, so a stale page cannot enrol a room
    // full of students into one that has since been renamed away (US-23, US-24).
    const offered = series.classOptions.find(
      (candidate) => normalizeName(candidate) === normalizeName(className),
    );
    if (offered === undefined) {
      throw new ServiceError(ErrorCode.NotFound, "Diese Klasse gibt es nicht.");
    }

    const previous = await transaction.get(
      adminDb
        .collection(COLLECTIONS.invitations)
        .where("eventSeriesId", "==", eventSeriesId)
        .where("class", "==", offered),
    );

    for (const stale of previous.docs) transaction.delete(stale.ref);
    transaction.set(invitationDoc(token), { eventSeriesId, class: offered });
    transaction.update(reference, { isOpenToStudents: true });

    return { token, eventSeriesId, class: offered };
  });
}

/**
 * What a link leads to, or null where it leads nowhere — mistyped, superseded by a regenerated
 * one, or naming a series that has since been closed, archived or deleted. The caller says the
 * one sentence US-23 gives for all of those, so that none of them can be told apart.
 */
export async function resolveInvitation(token: string): Promise<Invitation | null> {
  const stored = await invitationDoc(token).get();
  if (!stored.exists) return null;

  const invitation = invitationSchema.safeParse({ token, ...stored.data() });
  if (!invitation.success) return null;

  const series = await adminDb
    .collection(COLLECTIONS.eventSeries)
    .doc(invitation.data.eventSeriesId)
    .get();
  if (!series.exists) return null;

  const parsed = eventSeriesSchema.safeParse({ id: series.id, ...series.data() });
  if (!parsed.success || !parsed.data.isOpenToStudents) return null;

  return invitation.data;
}

/**
 * The class a link enrols into, where the link leads somewhere and names this series.
 *
 * A token for another series is treated as no token at all rather than as an error: a student
 * looking at one registration while holding a link to a different one has done nothing wrong,
 * and the link still takes them there from the landing page.
 */
export async function invitedClassFor(
  eventSeriesId: string,
  token: string | null,
): Promise<string | null> {
  if (token === null) return null;

  const invitation = await resolveInvitation(token);
  return invitation?.eventSeriesId === eventSeriesId ? invitation.class : null;
}
