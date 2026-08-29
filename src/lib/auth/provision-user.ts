/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { commitInChunks, type BatchOperation } from "@/lib/firebase/batch";
import { COLLECTIONS } from "@/lib/schemas/collections";
import type { Registration } from "@/lib/schemas/registration";
import { userRoleSchema, userSchema, type User } from "@/lib/schemas/user";
import { fetchEntraName, fetchEntraPhoto } from "./graph";
import { refuseSignIn } from "./sign-in-policy";
import { roleFromUpn } from "./upn";

export type EntraClaims = {
  uid: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  role?: unknown;
  firebase?: { sign_in_provider?: string };
};

export type ProvisionOutcome =
  { ok: true; user: User } | { ok: false; reason: string; message?: string };

/** Capitalises a UPN segment: "stauss-mueller" becomes "Stauss-Mueller". */
function titleCase(segment: string): string {
  return segment.replace(/(^|[-'])(\p{Ll})/gu, (_, lead: string, letter: string) =>
    lead.concat(letter.toLocaleUpperCase("de-AT")),
  );
}

/**
 * The name to fall back on when Graph could not supply one.
 *
 * `given_name` and `family_name` are used when Entra sends them, each for what it says it is.
 * The display name is not used at all: its word order is the tenant's choice — this school
 * writes "Stauss Hannes" — so splitting it is a coin toss, and it landed the wrong way up. The
 * UPN's local part is `firstname.lastname` by the tenant's own convention (US-3, US-16), which
 * makes it the better guess, umlauts spelled out and all.
 */
function resolveName(claims: EntraClaims, localPart: string) {
  const given = claims.given_name?.trim();
  const family = claims.family_name?.trim();

  const [first, ...rest] = localPart.split(".").filter(Boolean);
  const fromUpn =
    first && rest.length > 0
      ? { firstName: titleCase(first), lastName: rest.map(titleCase).join(" ") }
      : { firstName: localPart, lastName: localPart };

  return {
    firstName: given || fromUpn.firstName,
    lastName: family || fromUpn.lastName,
  };
}

/** What a registration copies off the user record, derived so a field added there reaches this. */
type StoredIdentity = Pick<Registration, "firstName" | "lastName" | "email">;

/**
 * Carries a corrected name into the registrations this student already holds (US-26).
 *
 * The copy on a registration is what lets the report, the board and both exports read a name
 * without joining to `users`. This is the repair that makes the copy safe: it is not a snapshot
 * that drifts, it is one that can never be more than a login out of date.
 *
 * Only a field that actually differs is written, so a login that changes nothing writes nothing
 * and wakes no teacher's subscription to say so. Registrations in an archived series are left
 * alone, because an archived series is read-only in everything it holds (US-19) — a name in last
 * year's report is a record of what was true then.
 */
async function refreshRegistrations(upn: string, identity: StoredIdentity): Promise<void> {
  const held = await adminDb
    .collectionGroup(COLLECTIONS.registrations)
    .where("studentUpn", "==", upn)
    .get();
  if (held.empty) return;

  const series = new Map<string, DocumentReference>();
  for (const registration of held.docs) {
    const owner = registration.ref.parent.parent;
    if (owner) series.set(owner.id, owner);
  }

  const archived = new Set(
    (await Promise.all([...series.values()].map((owner) => owner.get())))
      .filter((owner) => owner.data()?.isArchived === true)
      .map((owner) => owner.id),
  );

  const operations = held.docs.flatMap((registration): BatchOperation[] => {
    const owner = registration.ref.parent.parent;
    if (!owner || archived.has(owner.id)) return [];

    const stored = registration.data();
    const corrections = Object.entries(identity).filter(([field, name]) => stored[field] !== name);
    if (corrections.length === 0) return [];

    return [(batch) => batch.update(registration.ref, Object.fromEntries(corrections))];
  });

  await commitInChunks(operations);
}

/**
 * Creates the user record on first login and keeps the role custom claim in sync (US-1, US-3).
 * Runs server-side only — the Admin SDK bypasses Security Rules, which deny client writes to `users`.
 */
export async function provisionUser(
  claims: EntraClaims,
  graphAccessToken?: string,
): Promise<ProvisionOutcome> {
  const upn = claims.email?.trim().toLowerCase();
  if (!upn) return { ok: false, reason: "missing-upn" };

  const derivedRole = roleFromUpn(upn);
  if (!derivedRole) return { ok: false, reason: "unsupported-domain" };

  // Whatever else this deployment refuses. Production refuses nothing here.
  const refusal = refuseSignIn({
    role: derivedRole,
    signInProvider: claims.firebase?.sign_in_provider,
  });
  if (refusal) return { ok: false, ...refusal };

  const localPart = upn.slice(0, upn.indexOf("@"));
  // Graph is the authoritative source, field by field: its `givenName` is the first name and
  // its `surname` the last one, so neither can be mistaken for the other. Whichever it cannot
  // supply falls back below.
  const [fromGraph, photo] = graphAccessToken
    ? await Promise.all([fetchEntraName(graphAccessToken), fetchEntraPhoto(graphAccessToken)])
    : [null, null];
  const fallback = resolveName(claims, localPart);
  const firstName = fromGraph?.firstName ?? fallback.firstName;
  const lastName = fromGraph?.lastName ?? fallback.lastName;
  const ref = adminDb.collection(COLLECTIONS.users).doc(upn);
  const snapshot = await ref.get();

  let role = derivedRole;
  if (snapshot.exists) {
    // The role is assigned once, at creation; a later login never recomputes it (US-3).
    const stored = userSchema.shape.role.safeParse(snapshot.data()?.role);
    if (stored.success) role = stored.data;
    // The photo is written even when there is none, so removing it in Entra removes it here.
    await ref.update({ firstName, lastName, email: upn, photo });
  } else {
    await ref.set({ firstName, lastName, email: upn, role, photo });
  }

  const user = userSchema.parse({ id: upn, firstName, lastName, email: upn, role, photo });

  // Only a student holds registrations: a teacher keeps none of their own (US-15).
  if (role === userRoleSchema.enum.student) {
    await refreshRegistrations(upn, { firstName, lastName, email: upn });
  }

  if (claims.role !== role) {
    await adminAuth.setCustomUserClaims(claims.uid, { role });
  }

  return { ok: true, user };
}
