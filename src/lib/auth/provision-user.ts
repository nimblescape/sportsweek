/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { userSchema, type User } from "@/lib/schemas/user";
import { fetchEntraName } from "./graph";
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
  const fromGraph = graphAccessToken ? await fetchEntraName(graphAccessToken) : null;
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
    await ref.update({ firstName, lastName, email: upn });
  } else {
    await ref.set({ firstName, lastName, email: upn, role });
  }

  const user = userSchema.parse({ id: upn, firstName, lastName, email: upn, role });

  if (claims.role !== role) {
    await adminAuth.setCustomUserClaims(claims.uid, { role });
  }

  return { ok: true, user };
}
