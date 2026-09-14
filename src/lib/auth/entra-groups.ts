/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

/**
 * What an Entra ID token says about the groups the person belongs to.
 *
 * Which claim carries them is the tenant's choice in Token configuration: `groups` normally,
 * `roles` where "Emit groups as role claims" is ticked — so both are read and reported.
 */
export type EntraGroupClaims = {
  /** Group object IDs from the `groups` claim. */
  groups: string[];
  /** The same IDs, where the tenant emits groups as role claims instead. */
  roles: string[];
  /** Entra sends `hasgroups` and drops the list when it was too long for the token. */
  overflowed: boolean;
};

/** The `=` padding `atob` expects and a base64url segment does not carry. */
function padded(segment: string): string {
  return segment.padEnd(segment.length + ((4 - (segment.length % 4)) % 4), "=");
}

/** The claims of a JWT, read without verifying it — see `entraGroupClaims` on why that is safe. */
function claimsOf(token: string): unknown {
  const [, payload] = token.split(".");
  if (!payload) return null;

  const bytes = Uint8Array.from(atob(padded(payload.replace(/-/g, "+").replace(/_/g, "/"))), (c) =>
    c.charCodeAt(0),
  );

  return JSON.parse(new TextDecoder().decode(bytes));
}

function idsOf(claim: unknown): string[] {
  if (!Array.isArray(claim)) return [];
  return claim.filter((value): value is string => typeof value === "string");
}

/**
 * Reads the group claims out of the ID token Entra issued for this sign-in.
 *
 * The signature is not checked, and nothing may be granted on the strength of this: it exists so
 * a sign-in can say out loud what the directory sent, which is otherwise invisible — Firebase
 * does not forward an OIDC provider's claims into its own token. Null means the token could not
 * be read at all.
 */
export function entraGroupClaims(idToken: string): EntraGroupClaims | null {
  let claims: unknown;
  try {
    claims = claimsOf(idToken);
  } catch {
    return null;
  }

  if (claims === null || typeof claims !== "object") return null;
  const { groups, roles, hasgroups } = claims as Record<string, unknown>;

  return { groups: idsOf(groups), roles: idsOf(roles), overflowed: hasgroups === true };
}
